/**
 * orchestration.ts — Multi-agent orchestration extension.
 *
 * Slash commands:
 *   /orch add <yaml> <task>   — spawn agent from YAML config
 *   /orch add <name> <task>   — quick-spawn with inline config
 *   /orch list                — list all active agents
 *   /orch remove <id>         — kill and remove an agent
 *   /orch status <id>         — detailed agent status
 *   /orch cont <id> <prompt>  — continue agent conversation
 *   /orch clear               — remove all agents
 *
 * Tools:
 *   orch_spawn, orch_list, orch_remove, orch_status, orch_continue
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { loadAgentConfig, type AgentConfig } from "./yaml-loader.ts";
import { spawnAgent, type AgentState, makeSessionFile } from "./agent-runner.ts";
import { applyExtensionDefaults } from "./themeMap.ts";
import {
	initMemory,
	readIndex,
	readMemory,
	writeMemory,
	appendToMemory,
	queryMemory,
	compactMemory,
	autoCompact,
	summarizeSection,
	getMemoryStats,
	getMemoryContext,
	type MemoryFile,
	MEMORY_FILES,
} from "./memory.ts";

export default function (pi: ExtensionAPI) {
	const agents: Map<number, AgentState> = new Map();
	let nextId = 1;
	let widgetCtx: any;

	// Find the lowest available agent ID (reuse gaps from removed agents)
	function nextAvailableId(): number {
		for (let i = 1; i < nextId; i++) {
			if (!agents.has(i)) return i;
		}
		return nextId++;
	}

	// ── State persistence ─────────────────────────────────────────────────

	const STATE_DIR = path.join(os.homedir(), ".pi", "agent", "state", "orch");
	const STATE_FILE = path.join(STATE_DIR, "registry.json");

	// ── Memory ─────────────────────────────────────────────────────────────

	let projectRoot: string = process.cwd();
	let memoryInitialized = false;

	function ensureStateDir() {
		fs.mkdirSync(STATE_DIR, { recursive: true });
	}

	function saveState() {
		ensureStateDir();
		const data = {
			agents: Array.from(agents.entries()).map(([id, a]) => ({
				id: a.id,
				name: a.name,
				config: a.config,
				status: a.status,
				task: a.task,
				sessionFile: a.sessionFile,
				turnCount: a.turnCount,
				toolCount: a.toolCount,
				elapsed: a.elapsed,
				createdAt: a.createdAt,
			})),
			nextId,
		};
		fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
	}

	function loadState() {
		if (!fs.existsSync(STATE_FILE)) return;
		try {
			const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
			if (data.nextId) nextId = data.nextId;
			// Note: we don't restore running processes, just the next ID counter
		} catch {
			// Corrupt state file — start fresh
		}
	}

	// ── Widget rendering ────────────────────────────────────────────────────

	function updateWidgets() {
		if (!widgetCtx) return;

		for (const [id, state] of Array.from(agents.entries())) {
			const key = `orch-${id}`;
			widgetCtx.ui.setWidget(key, (_tui: any, theme: any) => {
				const container = new Container();
				const borderFn = (s: string) => theme.fg("dim", s);

				container.addChild(new Text("", 0, 0));
				container.addChild(new DynamicBorder(borderFn));
				const content = new Text("", 1, 0);
				container.addChild(content);
				container.addChild(new DynamicBorder(borderFn));

				return {
					render(width: number): string[] {
						const lines: string[] = [];
						const statusColor =
							state.status === "running"
								? "accent"
								: state.status === "done"
								? "success"
								: "error";
						const statusIcon =
							state.status === "running"
								? "●"
								: state.status === "done"
								? "✓"
								: "✗";

						const taskPreview =
							state.task.length > 50
								? state.task.slice(0, 47) + "..."
								: state.task;

						const turnLabel =
							state.turnCount > 1
								? theme.fg("dim", ` · Turn ${state.turnCount}`)
								: "";

						const configLabel = theme.fg(
							"dim",
							` [${state.config.model.split("/").pop() || state.config.model}]`,
						);

						lines.push(
							theme.fg(statusColor, `${statusIcon} ${state.name} #${state.id}`) +
								turnLabel +
								theme.fg("dim", `  ${taskPreview}`) +
								configLabel +
								theme.fg("dim", `  (${Math.round(state.elapsed / 1000)}s)`) +
								theme.fg("dim", ` | Tools: ${state.toolCount}`),
						);

						const fullText = state.textChunks.join("");
						const lastLine =
							fullText.split("\n").filter((l: string) => l.trim()).pop() || "";
						if (lastLine) {
							const trimmed =
								lastLine.length > width - 10
									? lastLine.slice(0, width - 13) + "..."
									: lastLine;
							lines.push(theme.fg("muted", `  ${trimmed}`));
						}

						content.setText(lines.join("\n"));
						return container.render(width);
					},
					invalidate() {
						container.invalidate();
					},
				};
			});
		}
	}

	function notify(msg: string, type: "info" | "success" | "warning" | "error" = "info") {
		if (widgetCtx) {
			widgetCtx.ui.notify(msg, type);
		}
	}

	// ── Agent spawning ──────────────────────────────────────────────────────

	function spawnAgentFromConfig(
		config: AgentConfig,
		task: string,
		ctx: any,
		existingState?: AgentState,
	): Promise<void> {
		const id = existingState?.id ?? nextAvailableId();
		const state =
			existingState ??
			({
				id,
				name: config.name,
				config,
				status: "running" as const,
				task,
				textChunks: [],
				toolCount: 0,
				elapsed: 0,
				sessionFile: "",
				turnCount: existingState ? existingState.turnCount + 1 : 1,
				createdAt: Date.now(),
			} as AgentState);

		if (!existingState) {
			state.sessionFile = makeSessionFile(config.name, id);
			agents.set(id, state);
		} else {
			state.status = "running";
			state.task = task;
			state.textChunks = [];
			state.elapsed = 0;
			state.turnCount++;
		}

		updateWidgets();
		saveState();

		// Inject memory context into the task
		let finalTask = task;
		const memoryContext = getMemoryContext(projectRoot, config.name);
		if (memoryContext) {
			finalTask = `You have existing memory about this project. Review it before starting:\n\n${memoryContext}\n\n---\n\nNew task: ${task}`;
		}

		return spawnAgent({
			id,
			config,
			task: finalTask,
			onProc: (proc) => {
				state.proc = proc;
			},
			notify: (msg, type) => {
				notify(msg, type);
				const s = agents.get(id);
				if (s) {
					s.status = type === "error" ? "error" : "done";
					s.elapsed = Date.now() - s.createdAt;
					updateWidgets();
					saveState();
				}
			},
			onUpdate: () => updateWidgets(),
			onResult: (agentId, result) => {
				// Write agent findings to memory
				writeAgentFindingsToMemory(config.name, task, result);

				// Auto-compact memory after each agent
				autoCompact(projectRoot);

				// Deliver result as follow-up to main agent
				pi.sendMessage(
					{
						customType: "orch-agent-result",
						content: `Agent "${config.name}" #${agentId} finished "${task}" in ${Math.round(state.elapsed / 1000)}s.\n\nResult:\n${result.slice(0, 8000)}${result.length > 8000 ? "\n\n... [truncated]" : ""}`,
						display: true,
					},
					{ deliverAs: "followUp", triggerTurn: true },
				);
			},
		});
	}

	/**
	 * Extract key findings from agent result and write to memory.
	 * Orchestrator writes the full result as a finding, then extracts
	 * specific metadata (files, dependencies, decisions) for categorization.
	 */
	function writeAgentFindingsToMemory(agentName: string, task: string, result: string): void {
		if (!memoryInitialized) {
			initMemory(projectRoot);
			memoryInitialized = true;
		}

		// Skip very short results
		if (result.length < 100) return;

		const now = new Date().toISOString().slice(0, 16).replace("T", " ");

		// 1) Write the full agent result as a finding entry (to Activity, not Architecture)
		const findingEntry = `- [${now}] ${agentName}: ${task}\n${result.trim()}`;
		writeMemory(projectRoot, "project.md", "Activity", findingEntry, agentName);

		// 2) Extract specific metadata for other memory files
		const lines = result.split("\n").filter((l) => l.trim());

		// Extract file paths
		const fileLines: string[] = [];
		const depLines: string[] = [];
		const decisionLines: string[] = [];

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;

			// Skip very short lines
			if (trimmed.length < 8) continue;

			// Clean up markdown artifacts for matching
			const clean = trimmed
				.replace(/^[-*•]\s+/, "")        // bullet points
				.replace(/^#+\s*/, "")           // markdown headers
				.replace(/`/g, "")               // backticks
				.replace(/^\|/, "");             // table pipes

			// File paths: lines with known extensions (after cleaning)
			if (/\.(ts|js|json|env|yaml|yml|toml|md|sh|css|html|tsx|jsx)$/.test(clean)) {
				fileLines.push(trimmed);
				continue;
			}

			// Skip tree/directory lines (they're already in the Architecture section)
			if (/^[├─│└]/.test(trimmed)) continue;

			// Dependencies: package names, import statements, framework mentions
			if (/\b(hono|node-server|express|fastify|koa|next|nuxt|vue|react|angular)/i.test(clean)) {
				depLines.push(trimmed);
				continue;
			}
			if (/\b(package|npm|yarn|pnpm|bun install)/i.test(clean) && /\d|\^|~|\*|"|'/.test(clean)) {
				depLines.push(trimmed);
				continue;
			}
			if (/\b(dependency|dependencies|library|framework|runtime|adapter)/i.test(clean)) {
				depLines.push(trimmed);
				continue;
			}

			// Decisions: strong language about choices
			if (/\b(decided|chose|should use|must use|avoid|don't use|recommend|preferred|convention)/i.test(clean)) {
				decisionLines.push(trimmed);
			}
		}

		// Write file paths to project.md Key Files section
		if (fileLines.length > 0) {
			const uniqueFiles = [...new Set(fileLines)].slice(0, 30);
			const content = uniqueFiles.map((f) => `- ${f}`).join("\n");
			writeMemory(projectRoot, "project.md", "Key Files", content, agentName);
		}

		// Write dependencies to reference.md
		if (depLines.length > 0) {
			const uniqueDeps = [...new Set(depLines)].slice(0, 20);
			const content = uniqueDeps.map((d) => `- ${d}`).join("\n");
			writeMemory(projectRoot, "reference.md", "Dependencies", content, agentName);
		}

		// Write decisions to decisions.md
		if (decisionLines.length > 0) {
			const uniqueDecisions = [...new Set(decisionLines)].slice(0, 20);
			const content = uniqueDecisions.map((d) => `- ${d}`).join("\n");
			writeMemory(projectRoot, "decisions.md", "Decisions", content, agentName);
		}
	}

	// ── Argument parser ─────────────────────────────────────────────────────
	// Handles quoted strings properly: 'scout "explore the codebase"'

	function parseFirstToken(input: string): { name: string; rest: string } | null {
		let i = 0;
		let name = "";

		// Skip leading whitespace
		while (i < input.length && input[i] === " ") i++;
		if (i >= input.length) return null;

		if (input[i] === '"') {
			// Quoted token
			i++;
			while (i < input.length && input[i] !== '"') {
				name += input[i];
				i++;
			}
			i++; // skip closing quote
		} else {
			// Unquoted token
			while (i < input.length && input[i] !== " ") {
				name += input[i];
				i++;
			}
		}

		// Skip whitespace between token and rest
		while (i < input.length && input[i] === " ") i++;

		return { name, rest: input.slice(i) };
	}

	// ── Slash: /orch add <yaml> <task> ──────────────────────────────────────

	pi.registerCommand("orch", {
		description: "Orchestrate agents: /orch add <yaml|name> <task> | list | remove <id> | status <id> | cont <id> <prompt> | clear",
		handler: async (args, ctx) => {
			widgetCtx = ctx;
			const trimmed = args?.trim() ?? "";

			if (!trimmed) {
				notify("Usage:\n  /orch add <yaml> <task>\n  /orch list\n  /orch remove <id>\n  /orch status <id>\n  /orch cont <id> <prompt>\n  /orch clear", "info");
				return;
			}

			const parts = trimmed.split(/\s+/);
			const action = parts[0];
			const rest = parts.slice(1).join(" ");

			switch (action) {
				case "add": {
					if (!rest) {
						notify("Usage: /orch add <yaml|name> <task>", "error");
						return;
					}

					// Parse: first token = name/path, rest = task
					const parsed = parseFirstToken(rest);
					if (!parsed || !parsed.rest) {
						notify("Usage: /orch add <yaml|name> <task>", "error");
						return;
					}

					const config = loadAgentConfig(parsed.name);
					if (!config) {
						notify(`Agent config not found: ${parsed.name}`, "error");
						return;
					}

					notify(`Spawning agent "${config.name}"...`, "info");
					spawnAgentFromConfig(config, parsed.rest, ctx);
					break;
				}

				case "list": {
					if (agents.size === 0) {
						notify("No active agents.", "info");
						return;
					}

					const list = Array.from(agents.values())
						.map(
							(a) =>
								`#${a.id} [${a.status.toUpperCase()}] ${a.name} (Turn ${a.turnCount}) — ${a.task}`,
						)
						.join("\n");

					notify(`Active agents (${agents.size}):\n${list}`, "info");
					break;
				}

				case "remove": {
					const id = parseInt(rest, 10);
					if (isNaN(id)) {
						notify("Usage: /orch remove <id>", "error");
						return;
					}

					const state = agents.get(id);
					if (!state) {
						notify(`No agent #${id} found.`, "error");
						return;
					}

					if (state.proc && state.status === "running") {
						state.proc.kill("SIGTERM");
						notify(`Agent "${state.name}" #${id} killed.`, "warning");
					} else {
						notify(`Agent "${state.name}" #${id} removed.`, "info");
					}

					widgetCtx.ui.setWidget(`orch-${id}`, undefined);
					agents.delete(id);
					saveState();
					break;
				}

				case "status": {
					const id = parseInt(rest, 10);
					if (isNaN(id)) {
						notify("Usage: /orch status <id>", "error");
						return;
					}

					const state = agents.get(id);
					if (!state) {
						notify(`No agent #${id} found.`, "error");
						return;
					}

					const status = `Agent #${id} — ${state.name}
Status:    ${state.status}
Task:      ${state.task}
Model:     ${state.config.model}
Tools:     ${state.config.tools}
Turn:      ${state.turnCount}
Tools used:${state.toolCount}
Elapsed:   ${Math.round(state.elapsed / 1000)}s
Session:   ${state.sessionFile}
Config:    ${state.config.configPath}`;

					notify(status, "info");
					break;
				}

				case "cont": {
					// Parse: first token = id, rest = prompt
					const parsed = parseFirstToken(rest);
					if (!parsed || !parsed.rest) {
						notify("Usage: /orch cont <id> <prompt>", "error");
						return;
					}

					const id = parseInt(parsed.name, 10);
					if (isNaN(id)) {
						notify("Usage: /orch cont <id> <prompt>", "error");
						return;
					}

					const state = agents.get(id);
					if (!state) {
						notify(`No agent #${id} found.`, "error");
						return;
					}

					if (state.status === "running") {
						notify(`Agent "${state.name}" #${id} is still running.`, "warning");
						return;
					}

					notify(`Continuing agent "${state.name}" #${id} (Turn ${state.turnCount + 1})…`, "info");
					spawnAgentFromConfig(state.config, parsed.rest, ctx, state);
					break;
				}

				case "clear": {
					let killed = 0;
					for (const [id, state] of Array.from(agents.entries())) {
						if (state.proc && state.status === "running") {
							state.proc.kill("SIGTERM");
							killed++;
						}
						widgetCtx.ui.setWidget(`orch-${id}`, undefined);
					}

					const total = agents.size;
					agents.clear();
					nextId = 1;
					saveState();

					const msg =
						total === 0
							? "No agents to clear."
							: `Cleared ${total} agent${total !== 1 ? "s" : ""}${killed > 0 ? ` (${killed} killed)` : ""}.`;
					notify(msg, total === 0 ? "info" : "success");
					break;
				}

				case "memory": {
					// Initialize memory if needed
					if (!memoryInitialized) {
						initMemory(projectRoot);
						memoryInitialized = true;
						notify("Memory system initialized.", "success");
					}

					const memArgs = rest.trim();
					if (!memArgs) {
						// Show index
						const index = readIndex(projectRoot);
						notify(index || "No memory yet.", "info");
						break;
					}

					const memParts = memArgs.split(/\s+/);
					const memAction = memParts[0];
					const memRest = memParts.slice(1).join(" ");

					switch (memAction) {
						case "read": {
							const file = memRest || MEMORY_INDEX;
							const content =
								file === MEMORY_INDEX
									? readIndex(projectRoot)
									: readMemory(projectRoot, file as MemoryFile);
							notify(content || `No content in ${file}.`, "info");
							break;
						}

						case "query": {
							if (!memRest) {
								notify("Usage: /orch memory query <search term>", "error");
								break;
							}
							const results = queryMemory(projectRoot, memRest);
							notify(results, "info");
							break;
						}

						case "compact": {
							const result = compactMemory(projectRoot);
							notify(result, "success");
							break;
						}

						case "list": {
							const index = readIndex(projectRoot);
							notify(index || "No memory files.", "info");
							break;
						}

						case "stats": {
							const stats = getMemoryStats(projectRoot);
							notify(stats, "info");
							break;
						}

						case "summarize": {
							if (!memRest) {
								notify("Usage: /orch memory summarize <file> <section>", "error");
								break;
							}
							const parts = memRest.split(/\s+/);
							const summaryFile = parts[0] as MemoryFile;
							const summarySection = parts.slice(1).join(" ");
							if (!MEMORY_FILES.includes(summaryFile)) {
								notify(`Unknown file: ${summaryFile}. Valid files: ${MEMORY_FILES.join(", ")}`, "error");
								break;
							}
							if (!summarySection) {
								notify("Usage: /orch memory summarize <file> <section>", "error");
								break;
							}
							const summaryResult = await summarizeSection(projectRoot, summaryFile, summarySection, true);
							notify(summaryResult, "info");
							break;
						}

						default:
							notify(
								`Unknown memory action: ${memAction}\nUsage: /orch memory [read|query|compact|stats|summarize|list] [args]`,
								"error",
							);
					}
					break;
				}

				default:
					notify(`Unknown action: ${action}. Use /orch for help.`, "error");
			}
		},
	});

	// ── Tools for the Main Agent ────────────────────────────────────────────

	pi.registerTool({
		name: "orch_spawn",
		description: "Spawn a new agent from a YAML config or inline configuration. Returns the agent ID immediately.",
		parameters: Type.Object({
			config: Type.Union([
				Type.Object({
					name: Type.String({ description: "Agent name/identifier" }),
					model: Type.Optional(Type.String({ description: "Model to use (default: openrouter/google/gemini-3-flash-preview)" })),
					tools: Type.Optional(Type.String({ description: "Comma-separated tools (default: read,bash,grep,find,ls)" })),
					system_prompt: Type.Optional(Type.String({ description: "System prompt for the agent" })),
				}),
				Type.String({ description: "Path to YAML config file or agent name" }),
			]),
			task: Type.String({ description: "The task to assign to the agent" }),
		}),
		execute: async (callId, args, _signal, _onUpdate, ctx) => {
			widgetCtx = ctx;
			let config: AgentConfig;

			if (typeof args.config === "string") {
				config = loadAgentConfig(args.config);
				if (!config) {
					return { content: [{ type: "text", text: `Error: Could not load config for "${args.config}".` }] };
				}
			} else {
				// Inline config
				const inlineConfig = {
					name: args.config.name,
					model: args.config.model || "openrouter/google/gemini-3-flash-preview",
					tools: args.config.tools || "read,bash,grep,find,ls",
					systemPrompt: args.config.system_prompt || "",
					maxTurns: 20,
					configPath: "<inline>",
				};
				config = inlineConfig as unknown as AgentConfig;
			}

			const id = nextAvailableId();
			const state: AgentState = {
				id,
				name: config.name,
				config,
				status: "running",
				task: args.task,
				textChunks: [],
				toolCount: 0,
				elapsed: 0,
				sessionFile: makeSessionFile(config.name, id),
				turnCount: 1,
				createdAt: Date.now(),
			};
			agents.set(id, state);
			updateWidgets();
			saveState();

			spawnAgentFromConfig(config, args.task, ctx, state);

			return {
				content: [{ type: "text", text: `Agent "${config.name}" #${id} spawned and running.` }],
			};
		},
	});

	pi.registerTool({
		name: "orch_list",
		description: "List all active agents with their status and tasks.",
		parameters: Type.Object({}),
		execute: async () => {
			if (agents.size === 0) {
				return { content: [{ type: "text", text: "No active agents." }] };
			}

			const list = Array.from(agents.values())
				.map(
					(a) =>
						`#${a.id} [${a.status.toUpperCase()}] ${a.name} (Turn ${a.turnCount}) — ${a.task}`,
				)
				.join("\n");

			return {
				content: [{ type: "text", text: `Active agents (${agents.size}):\n${list}` }],
			};
		},
	});

	pi.registerTool({
		name: "orch_remove",
		description: "Remove a specific agent. Kills it if currently running.",
		parameters: Type.Object({
			id: Type.Number({ description: "The ID of the agent to remove" }),
		}),
		execute: async (callId, args, _signal, _onUpdate, ctx) => {
			widgetCtx = ctx;
			const state = agents.get(args.id);
			if (!state) {
				return { content: [{ type: "text", text: `Error: No agent #${args.id} found.` }] };
			}

			if (state.proc && state.status === "running") {
				state.proc.kill("SIGTERM");
				notify(`Agent "${state.name}" #${args.id} killed.`, "warning");
			} else {
				notify(`Agent "${state.name}" #${args.id} removed.`, "info");
			}

			widgetCtx.ui.setWidget(`orch-${args.id}`, undefined);
			agents.delete(args.id);
			saveState();

			return {
				content: [{ type: "text", text: `Agent "${state.name}" #${args.id} removed.` }],
			};
		},
	});

	pi.registerTool({
		name: "orch_status",
		description: "Get detailed status of a specific agent.",
		parameters: Type.Object({
			id: Type.Number({ description: "The ID of the agent" }),
		}),
		execute: async (callId, args, _signal, _onUpdate, ctx) => {
			widgetCtx = ctx;
			const state = agents.get(args.id);
			if (!state) {
				return { content: [{ type: "text", text: `Error: No agent #${args.id} found.` }] };
			}

			const status = `Agent #${state.id} — ${state.name}
Status:    ${state.status}
Task:      ${state.task}
Model:     ${state.config.model}
Tools:     ${state.config.tools}
Turn:      ${state.turnCount}
Tools used:${state.toolCount}
Elapsed:   ${Math.round(state.elapsed / 1000)}s
Session:   ${state.sessionFile}
Config:    ${state.config.configPath}`;

			return { content: [{ type: "text", text: status }] };
		},
	});

	pi.registerTool({
		name: "orch_continue",
		description: "Continue an existing agent's conversation. Returns immediately while it runs.",
		parameters: Type.Object({
			id: Type.Number({ description: "The ID of the agent to continue" }),
			prompt: Type.String({ description: "The follow-up prompt or new instructions" }),
		}),
		execute: async (callId, args, _signal, _onUpdate, ctx) => {
			widgetCtx = ctx;
			const state = agents.get(args.id);
			if (!state) {
				return { content: [{ type: "text", text: `Error: No agent #${args.id} found.` }] };
			}
			if (state.status === "running") {
				return { content: [{ type: "text", text: `Error: Agent #${args.id} is still running.` }] };
			}

			notify(`Continuing agent "${state.name}" #${args.id}…`, "info");
			spawnAgentFromConfig(state.config, args.prompt, ctx, state);

			return {
				content: [{ type: "text", text: `Agent "${state.name}" #${args.id} continuing conversation.` }],
			};
		},
	});

	// ── Memory Tools ────────────────────────────────────────────────────

	pi.registerTool({
		name: "orch_memory_read",
		description: "Read memory from a specific file or the index.",
		parameters: Type.Object({
			file: Type.Optional(
				Type.Union([
					Type.Literal("MEMORY.md"),
					...MEMORY_FILES.map((f) => Type.Literal(f)),
				]),
			),
		}),
		execute: async (_callId, args, _signal, _onUpdate, ctx) => {
			widgetCtx = ctx;
			if (!memoryInitialized) {
				initMemory(projectRoot);
				memoryInitialized = true;
			}

			const file = args.file || "MEMORY.md";
			const content =
				file === "MEMORY.md"
					? readIndex(projectRoot)
					: readMemory(projectRoot, file as MemoryFile);

			return {
				content: [{ type: "text", text: content || `No content in ${file}.` }],
			};
		},
	});

	pi.registerTool({
		name: "orch_memory_query",
		description: "Search memory for a keyword or phrase. Returns matching sections.",
		parameters: Type.Object({
			query: Type.String({ description: "The search term or phrase" }),
			file: Type.Optional(
				Type.Union([
					...MEMORY_FILES.map((f) => Type.Literal(f)),
					Type.Array(Type.Union(MEMORY_FILES.map((f) => Type.Literal(f)))),
				]),
			),
		}),
		execute: async (_callId, args, _signal, _onUpdate, ctx) => {
			widgetCtx = ctx;
			if (!memoryInitialized) {
				initMemory(projectRoot);
				memoryInitialized = true;
			}

			const results = queryMemory(projectRoot, args.query, args.file);
			return {
				content: [{ type: "text", text: results }],
			};
		},
	});

	pi.registerTool({
		name: "orch_memory_compact",
		description: "Compact memory files — trim oldest entries to stay within token budget.",
		parameters: Type.Object({}),
		execute: async (_callId, _args, _signal, _onUpdate, ctx) => {
			widgetCtx = ctx;
			if (!memoryInitialized) {
				initMemory(projectRoot);
				memoryInitialized = true;
			}

			const result = compactMemory(projectRoot);
			return {
				content: [{ type: "text", text: result }],
			};
		},
	});

	// ── Session lifecycle ───────────────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
		widgetCtx = ctx;
		projectRoot = process.cwd();
		loadState();

		// Initialize memory system
		if (!memoryInitialized) {
			initMemory(projectRoot);
			memoryInitialized = true;
		}

		// Clean up any stale processes from previous session
		for (const [id, state] of Array.from(agents.entries())) {
			if (state.proc && state.status === "running") {
				state.proc.kill("SIGTERM");
			}
			widgetCtx.ui.setWidget(`orch-${id}`, undefined);
		}
		agents.clear();
	});
}
