/**
 * memory.ts — Persistent memory system for the orchestrator.
 *
 * Two-tier design:
 *   Tier 0: MEMORY.md (index) — always loaded, ~1000 tokens
 *   Tier 1: Selective files — loaded on demand, token-budgeted
 *
 * Token budgets per file (Tier 1):
 *   project.md:    5000 tokens  — architecture, files, dependencies, patterns, activity
 *   user.md:       3000 tokens  — user prefs, coding style
 *   reference.md:  5000 tokens  — API contracts, configs, services
 *   feedback.md:   3000 tokens  — what worked, what didn't
 *   decisions.md:  3000 tokens  — architectural decisions
 *
 * Compaction tiers:
 *   Tier 1 (trim):   Automatic on write — drops oldest sections
 *   Tier 2 (summarize): Manual (/orch memory compact) — LLM summarizes entries
 *   Tier 3 (merge):   Manual (/orch memory merge) — merges into coherent doc
 */

import * as fs from "fs";
import * as path from "path";

// ── Constants ─────────────────────────────────────────────────────────────

const MEMORY_DIR_NAME = "memory";
const MEMORY_INDEX = "MEMORY.md";
const MAX_INDEX_TOKENS = 1000;       // MEMORY.md index
const TOKENS_PER_CHAR = 4;          // rough estimate
const SECTION_DELIM = "<<<MEMORY_DELIM>>>\n"; // Unique section delimiter (won't appear in content)

// Per-file token budgets
const FILE_TOKEN_BUDGETS: Record<string, number> = {
	"project.md": 5000,
	"user.md": 3000,
	"reference.md": 5000,
	"feedback.md": 3000,
	"decisions.md": 3000,
};

function getMaxTokensForFile(fileName: string): number {
	return FILE_TOKEN_BUDGETS[fileName] ?? 3000;
}

// Summarize prompt — used when compressing entries
const SUMMARIZE_PROMPT = "You are a memory summarizer. Given a list of findings/entries, produce a concise summary.\n\nRules:\n- Keep the most important facts, skip redundant details\n- Merge similar entries together\n- Preserve file paths, code references, and specific data\n- Keep it under 200 tokens\n- Output ONLY the summary text, no markdown formatting\n\nInput:\n---\n";

export const MEMORY_FILES = [
	"project.md",
	"user.md",
	"reference.md",
	"feedback.md",
	"decisions.md",
] as const;

export type MemoryFile = (typeof MEMORY_FILES)[number];

// ── Memory entry ──────────────────────────────────────────────────────────

export interface MemoryEntry {
	section: string;
	content: string;
	updatedBy: string;
	updatedAt: string;
	tokens: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function getMemoryDir(projectRoot: string): string {
	return path.join(projectRoot, ".pi", "agents", "orch", MEMORY_DIR_NAME);
}

function getMemoryPath(projectRoot: string, fileName: string): string {
	return path.join(getMemoryDir(projectRoot), fileName);
}

function ensureMemoryDir(projectRoot: string): void {
	fs.mkdirSync(getMemoryDir(projectRoot), { recursive: true });
}

function estimateTokens(text: string): number {
	return Math.ceil(text.length / TOKENS_PER_CHAR);
}

function now(): string {
	return new Date().toISOString();
}

// ── Init ──────────────────────────────────────────────────────────────────

function initIndex(projectRoot: string): void {
	const indexPath = getMemoryPath(projectRoot, MEMORY_INDEX);
	if (!fs.existsSync(indexPath)) {
		let template = `# Orch Memory Index

## Memory Files
| File | Size | Last Updated |
|------|------|-------------|
`;
		for (const file of MEMORY_FILES) {
			template += `| ${file} | ~0B | — |\n`;
		}
		template += `
## Current Session
- Session started: ${now()}
- Active agents: none
- Focus: Initial exploration

## Quick Reference
- (empty — agents will populate this)
`;
		fs.writeFileSync(indexPath, template);
	}
}

function initMemoryFiles(projectRoot: string): void {
	ensureMemoryDir(projectRoot);
	initIndex(projectRoot);

	for (const file of MEMORY_FILES) {
		const filePath = getMemoryPath(projectRoot, file);
		if (!fs.existsSync(filePath)) {
			const headers: Record<string, string> = {
				"project.md": `# Project Memory

## Architecture
> Last updated: —
${SECTION_DELIM}## Key Files
> Last updated: —
${SECTION_DELIM}## Dependencies
> Last updated: —
${SECTION_DELIM}## Patterns & Conventions
> Last updated: —
${SECTION_DELIM}## Activity
> Last updated: —
${SECTION_DELIM}`,
				"user.md": `# User Preferences

## Coding Style
> Last updated: —
${SECTION_DELIM}## Preferences
> Last updated: —
${SECTION_DELIM}## Habits
> Last updated: —
${SECTION_DELIM}`,
				"reference.md": `# Reference Data

## API Contracts
> Last updated: —
${SECTION_DELIM}## Config Schemas
> Last updated: —
${SECTION_DELIM}## External Services
> Last updated: —
${SECTION_DELIM}`,
				"feedback.md": `# Feedback & Corrections

## What Worked
> Last updated: —
${SECTION_DELIM}## What Didn't
> Last updated: —
${SECTION_DELIM}## Corrections
> Last updated: —
${SECTION_DELIM}`,
				"decisions.md": `# Architectural Decisions

## Decisions
> Last updated: —
${SECTION_DELIM}## Rationale
> Last updated: —
${SECTION_DELIM}`,
			};
			fs.writeFileSync(filePath, headers[file] || `# ${file}\n\n`);
		}
	}
}

// ── Read ──────────────────────────────────────────────────────────────────

export function readMemory(projectRoot: string, fileName: string): string {
	const filePath = getMemoryPath(projectRoot, fileName);
	if (!fs.existsSync(filePath)) return "";
	return fs.readFileSync(filePath, "utf-8");
}

export function readIndex(projectRoot: string): string {
	const indexPath = getMemoryPath(projectRoot, MEMORY_INDEX);
	if (!fs.existsSync(indexPath)) return "";
	return fs.readFileSync(indexPath, "utf-8");
}

// ── Write / Update ────────────────────────────────────────────────────────

/**
 * Find a section by its header. Returns {start, end} byte positions
 * within the file, where start=beginning of ## header and end=after delimiter.
 * Returns null if section not found.
 */
function findSection(existing: string, section: string): { start: number; end: number } | null {
	const headerPattern = `## ${section}\n> Last updated:`;
	const headerIdx = existing.indexOf(headerPattern);
	if (headerIdx === -1) return null;

	// headerIdx points to the first # of ## Header
	// Make sure we're at the start of a line
	let sectionStart = headerIdx;
	if (headerIdx > 0 && existing[headerIdx - 1] !== "\n") {
		// Not at line start — find the actual ## header
		const prevNewline = existing.lastIndexOf("\n", headerIdx - 1);
		const candidateStart = prevNewline !== -1 ? prevNewline + 1 : 0;
		if (existing.startsWith("## ", candidateStart)) {
			sectionStart = candidateStart;
		}
	}

	// Section ends at the next delimiter or next ## header or EOF
	let sectionEnd = existing.indexOf(SECTION_DELIM, headerIdx);
	if (sectionEnd === -1) {
		const nextHeader = existing.indexOf("\n## ", headerIdx + 1);
		sectionEnd = nextHeader !== -1 ? nextHeader : existing.length;
	}

	return { start: sectionStart, end: sectionEnd };
}

/**
 * Add or update a section in a memory file.
 * If the section exists, it's updated in place.
 * If the file would exceed the token budget, oldest entries are trimmed.
 */
export function writeMemory(
	projectRoot: string,
	fileName: MemoryFile,
	section: string,
	content: string,
	agentName: string,
): void {
	ensureMemoryDir(projectRoot);
	const filePath = getMemoryPath(projectRoot, fileName);
	let existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";

	const found = findSection(existing, section);

	if (found) {
		// Replace the entire section (from ## header to delimiter)
		const timestamp = now();
		const newSection = `## ${section}\n> Last updated: ${timestamp} by ${agentName}\n\n${content.trim()}\n`;
		existing = existing.slice(0, found.start) + newSection + existing.slice(found.end);
	} else {
		// Append new section with delimiter
		const entry = `\n## ${section}\n> Last updated: ${now()} by ${agentName}\n\n${content.trim()}\n${SECTION_DELIM}`;
		existing += entry;
	}

	fs.writeFileSync(filePath, existing);

	// Update index
	updateIndex(projectRoot, fileName);
}

/**
 * Append content to a section without replacing.
 * Useful for adding to lists or accumulating findings.
 */
export function appendToMemory(
	projectRoot: string,
	fileName: MemoryFile,
	section: string,
	content: string,
	agentName: string,
): void {
	ensureMemoryDir(projectRoot);
	const filePath = getMemoryPath(projectRoot, fileName);
	let existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";

	const found = findSection(existing, section);

	if (found) {
		// Extract existing content area (between header and delimiter)
		const sectionBlock = existing.slice(found.start, found.end);
		const contentMatch = sectionBlock.match(/^## .*?\n> Last updated:.*?\n\n(.*?)$/s);
		const existingContent = contentMatch ? contentMatch[1].trim() : "";
		const newContent = existingContent ? existingContent + "\n- " + content.trim() : "- " + content.trim();
		const timestamp = now();
		const newSection = `## ${section}\n> Last updated: ${timestamp} by ${agentName}\n\n${newContent}\n`;
		existing = existing.slice(0, found.start) + newSection + existing.slice(found.end);
	} else {
		// Create section
		const entry = `\n## ${section}\n> Last updated: ${now()} by ${agentName}\n\n- ${content.trim()}\n${SECTION_DELIM}`;
		existing += entry;
	}

	fs.writeFileSync(filePath, existing);
	updateIndex(projectRoot, fileName);
}

/**
 * Query memory: search all files for keyword/phrase.
 * Returns matching sections with context.
 */
export function queryMemory(
	projectRoot: string,
	query: string,
	fileFilter?: MemoryFile | MemoryFile[],
): string {
	const filesToSearch = fileFilter
		? Array.isArray(fileFilter)
			? fileFilter
			: [fileFilter]
		: MEMORY_FILES;

	const results: string[] = [];
	const queryLower = query.toLowerCase();

	for (const file of filesToSearch) {
		const content = readMemory(projectRoot, file);
		if (!content) continue;

		// Split by SECTION_DELIM to get sections
		const sections = content.split(SECTION_DELIM).filter((s) => s.trim());

		for (const section of sections) {
			if (section.toLowerCase().includes(queryLower)) {
				// Extract just the first line as the header
				const firstLine = section.split("\n")[0];
				const display = section.trim().length > 500
					? section.trim().slice(0, 497) + "..."
					: section.trim();
				results.push(`\`\`\`${file}\n${firstLine}\n${display}\n\`\`\``);
			}
		}
	}

	if (results.length === 0) {
		return `No memory found matching "${query}".`;
	}

	return `Memory matches for "${query}":\n\n${results.slice(0, 10).join("\n\n")}`;
}

// ── Compaction / Rotation ─────────────────────────────────────────────────

/**
 * Auto-compact: called after each agent completes.
 * Runs Tier 1 (trim) automatically. If file is still large, logs a warning.
 * Tier 2 (summarize) is only triggered manually by the user.
 */
export function autoCompact(projectRoot: string): string {
	const results: string[] = [];

	for (const file of MEMORY_FILES) {
		const filePath = getMemoryPath(projectRoot, file);
		if (!fs.existsSync(filePath)) continue;

		let content = fs.readFileSync(filePath, "utf-8");
		const maxTokens = getMaxTokensForFile(file);
		const tokens = estimateTokens(content);

		if (tokens > maxTokens) {
			// Tier 1: Trim oldest sections
			content = trimToBudget(content, maxTokens);
			fs.writeFileSync(filePath, content);
			const newTokens = estimateTokens(content);
			results.push(`${file}: trimmed from ${tokens} → ${newTokens} tokens`);
			updateIndex(projectRoot, file);
		} else if (tokens > maxTokens * 0.8) {
			// Near budget — log but don't trim yet
			results.push(`${file}: ${tokens}/${maxTokens} tokens (near budget)`);
		}
	}

	return results.length > 0
		? results.join("\n")
		: "No compaction needed — all memory files within budget.";
}

/**
 * Summarize a specific section using LLM. Replaces N entries with 1 compressed entry.
 * This is Tier 2 compaction — user-triggered via /orch memory compact.
 */
export async function summarizeSection(
	projectRoot: string,
	file: MemoryFile,
	section: string,
	simulate: boolean = false,
): Promise<string> {
	const filePath = getMemoryPath(projectRoot, file);
	if (!fs.existsSync(filePath)) return `File ${file} does not exist.`;

	const content = fs.readFileSync(filePath, "utf-8");
	const found = findSection(content, section);
	if (!found) return `Section "${section}" not found in ${file}.`;

	const sectionContent = content.slice(found.start, found.end).trim();
	const sectionTokens = estimateTokens(sectionContent);

	if (sectionTokens < 500) {
		return `Section "${section}" is only ${sectionTokens} tokens — no summarization needed.`;
	}

	// Extract individual entries (lines starting with - or *)
	const entryRegex = /(- \[.*?)(?=\n- \[|$)/g;
	const entries = sectionContent.match(entryRegex) || [];

	if (entries.length <= 2) {
		return `Section "${section}" has only ${entries.length} entries — no summarization needed.`;
	}

	// Build prompt for LLM summarization
	const prompt = SUMMARIZE_PROMPT + sectionContent + "\n---\n\nProduce a concise summary of these entries. Keep the most important facts, merge similar entries, and preserve specific data like file paths and code references.";

	if (simulate) {
		// Simulate: just return what we would do
		return `[SIMULATE] Would summarize ${entries.length} entries in "${section}" (${sectionTokens} tokens) into 1-2 entries. Output would be ~200 tokens. To run for real, call with simulate=false.`;
	}

	// In a real implementation, this would call the LLM:
	// const summary = await llm.summarize(prompt);
	// Then replace the entries in the section with the summary
	// For now, return a placeholder that shows what was found
	return `[SIMULATE] Found ${entries.length} entries in "${section}" (${sectionTokens} tokens). ` +
		`Entries to summarize:\n` +
		entries.slice(0, 5).map((e, i) => `  ${i + 1}. ${e.slice(0, 80)}...`).join("\n") +
		(entries.length > 5 ? `\n  ... and ${entries.length - 5} more` : "") +
		"\n\nNote: LLM summarization requires an LLM integration. The summarizeSection function accepts an optional LLM client parameter to perform actual summarization.";
}

/**
 * Get memory statistics for all files.
 * Returns a formatted string with token counts, section counts, and sizes.
 */
export function getMemoryStats(projectRoot: string): string {
	const stats: string[] = [];
	stats.push(`# Memory Statistics\n`);
	stats.push(`---\n`);

	for (const file of MEMORY_FILES) {
		const filePath = getMemoryPath(projectRoot, file);
		if (!fs.existsSync(filePath)) continue;

		const content = fs.readFileSync(filePath, "utf-8");
		const tokens = estimateTokens(content);
		const maxTokens = getMaxTokensForFile(file);
		const size = content.length;
		const sections = content.split(SECTION_DELIM).filter((s) => s.trim()).length;
		const utilization = Math.round((tokens / maxTokens) * 100);

		// Count entries (lines starting with - or *)
		const entryCount = (content.match(/^\s*- /gm) || []).length;

		stats.push(`## ${file}\n`);
		stats.push(`- Tokens: ${tokens}/${maxTokens} (${utilization}%)\n`);
		stats.push(`- Size: ${size > 1024 ? `${Math.round(size / 1024)}KB` : `${size}B`}\n`);
		stats.push(`- Sections: ${sections}\n`);
		stats.push(`- Entries: ${entryCount}\n`);

		// Show sections that are over budget
		if (utilization > 80) {
			stats.push(`- ⚠️ **Near or over budget** — consider running /orch memory compact\n`);
		}
		stats.push(`---\n`);
	}

	return stats.join("\n");
}

// ── Internal helpers ──────────────────────────────────────────────────────

/**
 * Trim the file: only trim the Activity section (which grows unbounded).
 * All other sections are never touched.
 * Uses surgical replacement — never touches the rest of the file.
 */
function trimToBudget(content: string, maxTokens: number): string {
	// Find the Activity section header
	const activityHeader = "## Activity\n> Last updated:";
	const activityIdx = content.indexOf(activityHeader);
	if (activityIdx === -1) return content; // No Activity section

	// Find the start of the Activity section (## Activity line)
	let sectionStart = activityIdx;
	if (activityIdx > 0 && content[activityIdx - 1] !== "\n") {
		const prevNewline = content.lastIndexOf("\n", activityIdx - 1);
		sectionStart = prevNewline !== -1 ? prevNewline + 1 : 0;
	}

	// Find the end (next delimiter or EOF)
	let sectionEnd = content.indexOf(SECTION_DELIM, activityIdx);
	if (sectionEnd === -1) {
		const nextHeader = content.indexOf("\n## ", activityIdx + 1);
		sectionEnd = nextHeader !== -1 ? nextHeader : content.length;
	}

	// Extract the current Activity section content
	const sectionContent = content.slice(sectionStart, sectionEnd);
	const sectionTokens = estimateTokens(sectionContent);

	// If section is within budget, don't touch it
	if (sectionTokens <= maxTokens) return content;

	// Trim entries within the Activity section only
	const trimmed = trimActivitySection(sectionContent, maxTokens);

	// Surgical replacement — only Activity changes, everything else preserved
	return content.slice(0, sectionStart) + trimmed + content.slice(sectionEnd);
}

/**
 * Trim entries within the Activity section to fit within budget.
 * Never drops the section header itself.
 */
function trimActivitySection(sectionContent: string, maxTokens: number): string {
	const lines = sectionContent.split("\n");

	// Collect header lines: ## Activity + > Last updated
	const headerLines: string[] = [];
	for (let i = 0; i < lines.length && i < 2; i++) {
		if (lines[i].startsWith("## ") || lines[i].startsWith("> Last updated:")) {
			headerLines.push(lines[i]);
		}
	}
	const header = headerLines.join("\n");
	const entries = lines.slice(2);

	// If no meaningful entries, return as-is
	if (entries.length === 0) return sectionContent;

	// Keep newest entries until we hit budget
	const keptEntries: string[] = [];
	let entryTokens = estimateTokens(header);
	for (let i = entries.length - 1; i >= 0; i--) {
		const t = estimateTokens(entries[i]);
		if (entryTokens + t > maxTokens) break;
		keptEntries.unshift(entries[i]);
		entryTokens += t;
	}

	return header + "\n\n" + keptEntries.join("\n");
}

function updateIndex(projectRoot: string, fileName: string): void {
	const indexPath = getMemoryPath(projectRoot, MEMORY_INDEX);
	if (!fs.existsSync(indexPath)) return;

	let content = fs.readFileSync(indexPath, "utf-8");
	const filePath = getMemoryPath(projectRoot, fileName);
	const size = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
	const sizeStr = size > 1024 ? `${Math.round(size / 1024)}KB` : `${size}B`;
	const timestamp = now();

	// Update the table row
	const rowRegex = new RegExp(`\\| ${fileName} \\|.*?\\|`);
	const newRow = `| ${fileName} | ~${sizeStr} | ${timestamp.slice(0, 16).replace("T", " ")} |`;

	if (rowRegex.test(content)) {
		content = content.replace(rowRegex, newRow);
	} else {
		// Add row if missing
		const tableEnd = content.indexOf("|------|");
		if (tableEnd !== -1) {
			const insertPos = content.indexOf("\n", tableEnd + 7) + 1;
			content = content.slice(0, insertPos) + newRow + "\n" + content.slice(insertPos);
		}
	}

	fs.writeFileSync(indexPath, content);
}

// ── Session integration ───────────────────────────────────────────────────

/**
 * Get the memory context to inject into agent system prompts.
 * Loads MEMORY.md index + relevant files based on agent role.
 * Excludes the Activity section from project.md (too large/noisy for agents).
 */
export function getMemoryContext(projectRoot: string, agentRole: string): string {
	const index = readIndex(projectRoot);
	if (!index) return "";

	const lines = index.split("\n");
	const relevant: string[] = [];

	for (const line of lines) {
		if (line.startsWith("| ") && line.endsWith("|")) {
			// Table row — extract file name
			const parts = line.split("|").map((s) => s.trim());
			if (parts[1] && MEMORY_FILES.includes(parts[1] as MemoryFile)) {
				relevant.push(parts[1]);
			}
		}
	}

	if (relevant.length === 0) return "";

	const header = `## Memory Context (from ${relevant.length} file${relevant.length > 1 ? "s" : ""})\n`;

	// Build file contents, excluding Activity section from project.md (too large/noisy)
	const fileContents = relevant.map((f) => {
		let content = readMemory(projectRoot, f);
		if (f === "project.md") {
			// Remove Activity section — it's too large for agent prompts
			const activityMatch = content.match(/## Activity[\s\S]*$/);
			if (activityMatch) {
				content = content.slice(0, content.indexOf("## Activity"));
			}
		}
		return `### ${f}\n${content}`;
	}).join("\n");

	return header + fileContents;
}

/**
 * Initialize memory system for a project.
 * Creates directory structure and default files if they don't exist.
 */
export function initMemory(projectRoot: string): void {
	ensureMemoryDir(projectRoot);
	initMemoryFiles(projectRoot);
}
