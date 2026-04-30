/**
 * agent-runner.ts — Spawn and manage individual agent processes.
 *
 * Each agent runs as a separate `pi` process with:
 *   --mode json (streaming output)
 *   --session <path> (persistent conversation)
 *   --model, --tools (from YAML config)
 *   --no-extensions (avoid recursive orchestration)
 */

import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { AgentConfig } from "./yaml-loader.ts";

export interface AgentState {
	id: number;
	name: string;
	config: AgentConfig;
	status: "running" | "done" | "error";
	task: string;
	textChunks: string[];
	toolCount: number;
	elapsed: number;
	sessionFile: string;
	turnCount: number;
	proc?: any;
	createdAt: number;
}

// ── Session file helpers ──────────────────────────────────────────────────

function makeSessionDir(): string {
	const dir = path.join(os.homedir(), ".pi", "agent", "sessions", "orch");
	fs.mkdirSync(dir, { recursive: true });
	return dir;
}

export function makeSessionFile(name: string, id: number): string {
	const dir = makeSessionDir();
	return path.join(dir, `${name}-${id}-${Date.now()}.jsonl`);
}

// ── Agent lifecycle ───────────────────────────────────────────────────────

interface SpawnAgentOptions {
	id: number;
	config: AgentConfig;
	task: string;
	notify: (msg: string, type?: "info" | "success" | "warning" | "error") => void;
	onUpdate: () => void;
	onResult: (agentId: number, result: string) => void;
	onProc: (proc: any) => void; // called with the ChildProcess reference
}

export function spawnAgent(opts: SpawnAgentOptions): Promise<void> {
	const { id, config, task, notify, onUpdate, onResult, onProc } = opts;

	const sessionFile = makeSessionFile(config.name, id);
	const model = config.model;
	const tools = config.tools;

	const prompt = config.systemPrompt
		? `${config.systemPrompt}\n\n---\n\nTask: ${task}`
		: task;

	return new Promise<void>((resolve) => {
		const proc = spawn(
			"pi",
			[
				"--mode", "json",
				"--session", sessionFile,
				"--no-extensions",
				"--model", model,
				"--tools", tools,
				"--thinking", "off",
				prompt,
			],
			{
				stdio: ["ignore", "pipe", "pipe"],
				env: { ...process.env },
			},
		);

		onProc(proc);

		const startTime = Date.now();
		let elapsed = 0;
		const timer = setInterval(() => {
			elapsed = Date.now() - startTime;
			onUpdate();
		}, 1000);

		let buffer = "";
		let toolCount = 0;
		let textChunks: string[] = [];

		proc.stdout!.setEncoding("utf-8");
		proc.stdout!.on("data", (chunk: string) => {
			buffer += chunk;
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";
			for (const line of lines) processLine(line);
		});

		proc.stderr!.setEncoding("utf-8");
		proc.stderr!.on("data", (chunk: string) => {
			if (chunk.trim()) {
				textChunks.push(chunk);
				onUpdate();
			}
		});

		proc.on("close", (code) => {
			if (buffer.trim()) processLine(buffer);
			clearInterval(timer);

			const elapsed = Date.now() - startTime;
			const result = textChunks.join("");
			const status = code === 0 ? "done" : "error";

			notify(
				`Agent "${config.name}" #${id} ${status} in ${Math.round(elapsed / 1000)}s`,
				status === "done" ? "success" : "error",
			);

			onResult(id, result);
			resolve();
		});

		proc.on("error", (err) => {
			clearInterval(timer);
			textChunks.push(`Error: ${err.message}`);
			notify(`Agent "${config.name}" #${id} error: ${err.message}`, "error");
			onUpdate();
			resolve();
		});

		// ── Line processor ──────────────────────────────────────────────

		function processLine(line: string) {
			if (!line.trim()) return;
			try {
				const event = JSON.parse(line);
				const type = event.type;

				if (type === "message_update") {
					const delta = event.assistantMessageEvent;
					if (delta?.type === "text_delta") {
						textChunks.push(delta.delta || "");
						onUpdate();
					}
				} else if (type === "tool_execution_start") {
					toolCount++;
					onUpdate();
				}
			} catch {
				// Not JSON — might be raw output
				textChunks.push(line);
				onUpdate();
			}
		}
	});
}
