/**
 * yaml-loader.ts — Parse and resolve agent YAML configurations.
 *
 * Config resolution order:
 *   1. Local:  <project>/.pi/agents/orch/agents/<name>.yaml
 *   2. Global: ~/.pi/agents/orch/agents/<name>.yaml
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUNDLED_AGENTS_DIR = path.join(__dirname, "..", "agents");

// ── YAML Parser (lightweight — no external deps) ──────────────────────────

/**
 * Minimal YAML parser for agent configs.
 * Handles: strings, multiline strings (|), integers, booleans, arrays.
 */
export function parseYAML(text: string): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	let currentKey: string | null = null;
	let multilineBuffer = "";
	let inMultiline = false;

	const lines = text.split("\n");

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trim();

		// Skip empty lines and comments
		if (!trimmed || trimmed.startsWith("#")) {
			if (inMultiline && trimmed === "") {
				multilineBuffer += "\n";
			}
			continue;
		}

		// End of multiline block
		if (inMultiline) {
			if (trimmed === "|" || trimmed === "") {
				inMultiline = false;
				result[currentKey!] = multilineBuffer.trim();
				currentKey = null;
				continue;
			}
			multilineBuffer += trimmed + "\n";
			continue;
		}

		// Key: value pairs
		const colonIdx = line.indexOf(":");
		if (colonIdx === -1) continue;

		const key = line.slice(0, colonIdx).trim();
		let value = line.slice(colonIdx + 1).trim();

		// Multiline string
		if (value === "|") {
			currentKey = key;
			multilineBuffer = "";
			inMultiline = true;
			continue;
		}

		// Inline array: [a, b, c]
		if (value.startsWith("[") && value.endsWith("]")) {
			const inner = value.slice(1, -1);
			result[key] = inner
				.split(",")
				.map((s: string) => s.trim().replace(/^["']|["']$/g, ""))
				.filter(Boolean);
			continue;
		}

		// Boolean
		if (value === "true" || value === "yes") {
			result[key] = true;
			continue;
		}
		if (value === "false" || value === "no") {
			result[key] = false;
			continue;
		}

		// Integer
		if (/^-?\d+$/.test(value)) {
			result[key] = parseInt(value, 10);
			continue;
		}

		// Quoted or plain string
		result[key] = value.replace(/^["']|["']$/g, "");
	}

	// Handle trailing multiline
	if (inMultiline && currentKey) {
		result[currentKey] = multilineBuffer.trim();
	}

	return result;
}

// ── Agent Config Interface ────────────────────────────────────────────────

export interface AgentConfig {
	name: string;
	model: string;
	tools: string;
	systemPrompt: string;
	maxTurns: number;
	configPath: string;
}

export const DEFAULT_MODEL = "openrouter/google/gemini-3-flash-preview";
export const DEFAULT_TOOLS = "read,bash,grep,find,ls";
export const DEFAULT_MAX_TURNS = 20;

// ── Config Resolution ─────────────────────────────────────────────────────

export function resolveAgentConfigPath(name: string): string | null {
	// 1. Local: <project>/.pi/agents/orch/agents/<name>.yaml
	const localDir = path.join(process.cwd(), ".pi", "agents", "orch", "agents");
	const localPath = path.join(localDir, `${name}.yaml`);
	if (fs.existsSync(localPath)) return localPath;

	// 2. Global: ~/.pi/agents/orch/agents/<name>.yaml
	const globalDir = path.join(os.homedir(), ".pi", "agents", "orch", "agents");
	const globalPath = path.join(globalDir, `${name}.yaml`);
	if (fs.existsSync(globalPath)) return globalPath;

	// 3. Bundled: extension/agents/<name>.yaml (fallback defaults)
	const bundledPath = path.join(BUNDLED_AGENTS_DIR, `${name}.yaml`);
	if (fs.existsSync(bundledPath)) return bundledPath;

	return null;
}

export function listAgentConfigs(): string[] {
	const configs: string[] = [];
	const dirs = [
		path.join(process.cwd(), ".pi", "agents", "orch", "agents"),
		path.join(os.homedir(), ".pi", "agents", "orch", "agents"),
		BUNDLED_AGENTS_DIR,
	];

	for (const dir of dirs) {
		if (!fs.existsSync(dir)) continue;
		const files = fs.readdirSync(dir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
		for (const file of files) {
			const fullPath = path.join(dir, file);
			// Avoid duplicates
			if (!configs.includes(fullPath)) {
				configs.push(fullPath);
			}
		}
	}

	return configs;
}

export function loadAgentConfig(nameOrPath: string): AgentConfig | null {
	let configPath: string;

	if (nameOrPath.endsWith(".yaml") || nameOrPath.endsWith(".yml")) {
		configPath = nameOrPath;
		if (!fs.existsSync(configPath)) {
			// Try resolving as a name
			configPath = resolveAgentConfigPath(nameOrPath);
			if (!configPath) {
				console.error(`Agent config not found: ${nameOrPath}`);
				return null;
			}
		}
	} else {
		configPath = resolveAgentConfigPath(nameOrPath);
		if (!configPath) {
			console.error(`Agent config not found: ${nameOrPath}`);
			return null;
		}
	}

	const raw = fs.readFileSync(configPath, "utf-8");
	const parsed = parseYAML(raw);

	const name = typeof parsed.name === "string" ? parsed.name : path.basename(configPath, ".yaml");
	const model = typeof parsed.model === "string" ? parsed.model : DEFAULT_MODEL;
	const tools = typeof parsed.tools === "string" ? parsed.tools : DEFAULT_TOOLS;
	const systemPrompt = typeof parsed.systemPrompt === "string" ? parsed.systemPrompt : "";
	const maxTurns =
		typeof parsed.maxTurns === "number" ? parsed.maxTurns : DEFAULT_MAX_TURNS;

	return {
		name,
		model,
		tools,
		systemPrompt,
		maxTurns,
		configPath,
	};
}
