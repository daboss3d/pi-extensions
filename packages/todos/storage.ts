import path from "node:path";
import fs from "node:fs/promises";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import crypto from "node:crypto";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
	type TodoFrontMatter,
	type TodoRecord,
	type TodoSettings,
	displayTodoId,
	validateTodoId,
	isTodoClosed,
	getTodoStatus,
	clearAssignmentIfClosed,
	TODO_DIR_NAME,
	TODO_PATH_ENV,
	TODO_SETTINGS_NAME,
	DEFAULT_TODO_SETTINGS,
	TodoStatus,
} from "./types";
import { withTodoLock } from "./locking";

// ── Directory / Path Helpers ─────────────────────────────────────────────────

export function getTodosDir(cwd: string): string {
	const overridePath = process.env[TODO_PATH_ENV];
	if (overridePath && overridePath.trim()) {
		return path.resolve(cwd, overridePath.trim());
	}
	return path.resolve(cwd, TODO_DIR_NAME);
}

export function getTodosDirLabel(cwd: string): string {
	const overridePath = process.env[TODO_PATH_ENV];
	if (overridePath && overridePath.trim()) {
		return path.resolve(cwd, overridePath.trim());
	}
	return TODO_DIR_NAME;
}

export function getTodoSettingsPath(todosDir: string): string {
	return path.join(todosDir, TODO_SETTINGS_NAME);
}

export function getTodoPath(todosDir: string, id: string): string {
	return path.join(todosDir, `${id}.md`);
}

// ── Settings ─────────────────────────────────────────────────────────────────

export function normalizeTodoSettings(raw: Partial<TodoSettings>): TodoSettings {
	const gc = raw.gc ?? DEFAULT_TODO_SETTINGS.gc;
	const gcDays = Number.isFinite(raw.gcDays) ? raw.gcDays : DEFAULT_TODO_SETTINGS.gcDays;
	return {
		gc: Boolean(gc),
		gcDays: Math.max(0, Math.floor(gcDays)),
	};
}

export async function readTodoSettings(todosDir: string): Promise<TodoSettings> {
	const settingsPath = getTodoSettingsPath(todosDir);
	let data: Partial<TodoSettings> = {};

	try {
		const raw = await fs.readFile(settingsPath, "utf8");
		data = JSON.parse(raw) as Partial<TodoSettings>;
	} catch {
		data = {};
	}

	return normalizeTodoSettings(data);
}

// ── Garbage Collection ───────────────────────────────────────────────────────

export async function garbageCollectTodos(todosDir: string, settings: TodoSettings): Promise<void> {
	if (!settings.gc) return;

	let entries: string[] = [];
	try {
		entries = await fs.readdir(todosDir);
	} catch {
		return;
	}

	const cutoff = Date.now() - settings.gcDays * 24 * 60 * 60 * 1000;
	await Promise.all(
		entries
			.filter((entry) => entry.endsWith(".md"))
			.map(async (entry) => {
				const id = entry.slice(0, -3);
				const filePath = path.join(todosDir, entry);
				try {
					const content = await fs.readFile(filePath, "utf8");
					const { frontMatter } = splitFrontMatter(content);
					const parsed = parseFrontMatter(frontMatter, id);
					if (!isTodoClosed(parsed.status)) return;
					const createdAt = Date.parse(parsed.created_at);
					if (!Number.isFinite(createdAt)) return;
					if (createdAt < cutoff) {
						await fs.unlink(filePath);
					}
				} catch {
					// ignore unreadable todo
				}
			}),
	);
}

// ── JSON / Front-Matter Parsing ──────────────────────────────────────────────

function findJsonObjectEnd(content: string): number {
	let depth = 0;
	let inString = false;
	let escaped = false;

	for (let i = 0; i < content.length; i += 1) {
		const char = content[i];

		if (inString) {
			if (escaped) {
				escaped = false;
				continue;
			}
			if (char === "\\") {
				escaped = true;
				continue;
			}
			if (char === "\"") {
				inString = false;
			}
			continue;
		}

		if (char === "\"") {
			inString = true;
			continue;
		}

		if (char === "{") {
			depth += 1;
			continue;
		}

		if (char === "}") {
			depth -= 1;
			if (depth === 0) return i;
		}
	}

	return -1;
}

export function splitFrontMatter(content: string): { frontMatter: string; body: string } {
	if (!content.startsWith("{")) {
		return { frontMatter: "", body: content };
	}

	const endIndex = findJsonObjectEnd(content);
	if (endIndex === -1) {
		return { frontMatter: "", body: content };
	}

	const frontMatter = content.slice(0, endIndex + 1);
	const body = content.slice(endIndex + 1).replace(/^\r?\n+/, "");
	return { frontMatter, body };
}

export function parseFrontMatter(text: string, idFallback: string): TodoFrontMatter {
	const data: TodoFrontMatter = {
		id: idFallback,
		title: "",
		tags: [],
		status: TodoStatus.OPEN,
		created_at: "",
		assigned_to_session: undefined,
	};

	const trimmed = text.trim();
	if (!trimmed) return data;

	try {
		const parsed = JSON.parse(trimmed) as Partial<TodoFrontMatter> | null;
		if (!parsed || typeof parsed !== "object") return data;
		if (typeof parsed.id === "string" && parsed.id) data.id = parsed.id;
		if (typeof parsed.title === "string") data.title = parsed.title;
		if (typeof parsed.status === "string" && parsed.status) data.status = parsed.status;
		if (typeof parsed.created_at === "string") data.created_at = parsed.created_at;
		if (typeof parsed.assigned_to_session === "string" && parsed.assigned_to_session.trim()) {
			data.assigned_to_session = parsed.assigned_to_session;
		}
		if (Array.isArray(parsed.tags)) {
			data.tags = parsed.tags.filter((tag): tag is string => typeof tag === "string");
		}
	} catch {
		return data;
	}

	return data;
}

// ── Todo Parsing / Serialization ─────────────────────────────────────────────

export function parseTodoContent(content: string, idFallback: string): TodoRecord {
	const { frontMatter, body } = splitFrontMatter(content);
	const parsed = parseFrontMatter(frontMatter, idFallback);
	return {
		id: idFallback,
		title: parsed.title,
		tags: parsed.tags ?? [],
		status: parsed.status,
		created_at: parsed.created_at,
		assigned_to_session: parsed.assigned_to_session,
		body: body ?? "",
	};
}

export function serializeTodo(todo: TodoRecord): string {
	const frontMatter = JSON.stringify(
		{
			id: todo.id,
			title: todo.title,
			tags: todo.tags ?? [],
			status: todo.status,
			created_at: todo.created_at,
			assigned_to_session: todo.assigned_to_session || undefined,
		},
		null,
		2,
	);

	const body = todo.body ?? "";
	const trimmedBody = body.replace(/^\n+/, "").replace(/\s+$/, "");
	if (!trimmedBody) return `${frontMatter}\n`;
	return `${frontMatter}\n\n${trimmedBody}\n`;
}

// ── File I/O ─────────────────────────────────────────────────────────────────

export async function ensureTodosDir(todosDir: string) {
	await fs.mkdir(todosDir, { recursive: true });
}

export async function readTodoFile(filePath: string, idFallback: string): Promise<TodoRecord> {
	const content = await fs.readFile(filePath, "utf8");
	return parseTodoContent(content, idFallback);
}

export async function writeTodoFile(filePath: string, todo: TodoRecord) {
	await fs.writeFile(filePath, serializeTodo(todo), "utf8");
}

export async function generateTodoId(todosDir: string): Promise<string> {
	for (let attempt = 0; attempt < 10; attempt += 1) {
		const id = crypto.randomBytes(4).toString("hex");
		const todoPath = getTodoPath(todosDir, id);
		if (!existsSync(todoPath)) return id;
	}
	throw new Error("Failed to generate unique todo id");
}

export async function ensureTodoExists(filePath: string, id: string): Promise<TodoRecord | null> {
	if (!existsSync(filePath)) return null;
	return readTodoFile(filePath, id);
}

export async function appendTodoBody(filePath: string, todo: TodoRecord, text: string): Promise<TodoRecord> {
	const spacer = todo.body.trim().length ? "\n\n" : "";
	todo.body = `${todo.body.replace(/\s+$/, "")}${spacer}${text.trim()}\n`;
	await writeTodoFile(filePath, todo);
	return todo;
}

// ── Listing ──────────────────────────────────────────────────────────────────

function sortTodos(todos: TodoFrontMatter[]): TodoFrontMatter[] {
	return [...todos].sort((a, b) => {
		const aClosed = isTodoClosed(a.status);
		const bClosed = isTodoClosed(b.status);
		if (aClosed !== bClosed) return aClosed ? 1 : -1;
		const aAssigned = !aClosed && Boolean(a.assigned_to_session);
		const bAssigned = !bClosed && Boolean(b.assigned_to_session);
		if (aAssigned !== bAssigned) return aAssigned ? -1 : 1;
		return (a.created_at || "").localeCompare(b.created_at || "");
	});
}

export async function listTodos(todosDir: string): Promise<TodoFrontMatter[]> {
	let entries: string[] = [];
	try {
		entries = await fs.readdir(todosDir);
	} catch {
		return [];
	}

	const todos: TodoFrontMatter[] = [];
	for (const entry of entries) {
		if (!entry.endsWith(".md")) continue;
		const id = entry.slice(0, -3);
		const filePath = path.join(todosDir, entry);
		try {
			const content = await fs.readFile(filePath, "utf8");
			const { frontMatter } = splitFrontMatter(content);
			const parsed = parseFrontMatter(frontMatter, id);
			todos.push({
				id,
				title: parsed.title,
				tags: parsed.tags ?? [],
				status: parsed.status,
				created_at: parsed.created_at,
				assigned_to_session: parsed.assigned_to_session,
			});
		} catch {
			// ignore unreadable todo
		}
	}

	return sortTodos(todos);
}

export function listTodosSync(todosDir: string): TodoFrontMatter[] {
	let entries: string[] = [];
	try {
		entries = readdirSync(todosDir);
	} catch {
		return [];
	}

	const todos: TodoFrontMatter[] = [];
	for (const entry of entries) {
		if (!entry.endsWith(".md")) continue;
		const id = entry.slice(0, -3);
		const filePath = path.join(todosDir, entry);
		try {
			const content = readFileSync(filePath, "utf8");
			const { frontMatter } = splitFrontMatter(content);
			const parsed = parseFrontMatter(frontMatter, id);
			todos.push({
				id,
				title: parsed.title,
				tags: parsed.tags ?? [],
				status: parsed.status,
				created_at: parsed.created_at,
				assigned_to_session: parsed.assigned_to_session,
			});
		} catch {
			// ignore
		}
	}

	return sortTodos(todos);
}

// ── Todo Operations (with locking) ───────────────────────────────────────────

export async function updateTodoStatus(
	todosDir: string,
	id: string,
	status: string,
	ctx: ExtensionContext,
): Promise<TodoRecord | { error: string }> {
	const validated = validateTodoId(id);
	if ("error" in validated) {
		return { error: validated.error };
	}
	const normalizedId = validated.id;
	const filePath = getTodoPath(todosDir, normalizedId);
	if (!existsSync(filePath)) {
		return { error: `Todo ${displayTodoId(id)} not found` };
	}

	const result = await withTodoLock(todosDir, normalizedId, ctx, async () => {
		const existing = await ensureTodoExists(filePath, normalizedId);
		if (!existing) return { error: `Todo ${displayTodoId(id)} not found` } as const;
		existing.status = status;
		clearAssignmentIfClosed(existing);
		await writeTodoFile(filePath, existing);
		return existing;
	});

	if (typeof result === "object" && "error" in result) {
		return { error: result.error };
	}

	return result;
}

export async function claimTodoAssignment(
	todosDir: string,
	id: string,
	ctx: ExtensionContext,
	force = false,
): Promise<TodoRecord | { error: string }> {
	const validated = validateTodoId(id);
	if ("error" in validated) {
		return { error: validated.error };
	}
	const normalizedId = validated.id;
	const filePath = getTodoPath(todosDir, normalizedId);
	if (!existsSync(filePath)) {
		return { error: `Todo ${displayTodoId(id)} not found` };
	}
	const sessionId = ctx.sessionManager.getSessionId();
	const result = await withTodoLock(todosDir, normalizedId, ctx, async () => {
		const existing = await ensureTodoExists(filePath, normalizedId);
		if (!existing) return { error: `Todo ${displayTodoId(id)} not found` } as const;
		if (isTodoClosed(existing.status)) {
			return { error: `Todo ${displayTodoId(id)} is closed` } as const;
		}
		const assigned = existing.assigned_to_session;
		if (assigned && assigned !== sessionId && !force) {
			return {
				error: `Todo ${displayTodoId(id)} is already assigned to session ${assigned}. Use force to override.`,
			} as const;
		}
		if (assigned !== sessionId) {
			existing.assigned_to_session = sessionId;
			await writeTodoFile(filePath, existing);
		}
		return existing;
	});

	if (typeof result === "object" && "error" in result) {
		return { error: result.error };
	}

	return result;
}

export async function releaseTodoAssignment(
	todosDir: string,
	id: string,
	ctx: ExtensionContext,
	force = false,
): Promise<TodoRecord | { error: string }> {
	const validated = validateTodoId(id);
	if ("error" in validated) {
		return { error: validated.error };
	}
	const normalizedId = validated.id;
	const filePath = getTodoPath(todosDir, normalizedId);
	if (!existsSync(filePath)) {
		return { error: `Todo ${displayTodoId(id)} not found` };
	}
	const sessionId = ctx.sessionManager.getSessionId();
	const result = await withTodoLock(todosDir, normalizedId, ctx, async () => {
		const existing = await ensureTodoExists(filePath, normalizedId);
		if (!existing) return { error: `Todo ${displayTodoId(id)} not found` } as const;
		const assigned = existing.assigned_to_session;
		if (!assigned) {
			return existing;
		}
		if (assigned !== sessionId && !force) {
			return {
				error: `Todo ${displayTodoId(id)} is assigned to session ${assigned}. Use force to release.`,
			} as const;
		}
		existing.assigned_to_session = undefined;
		await writeTodoFile(filePath, existing);
		return existing;
	});

	if (typeof result === "object" && "error" in result) {
		return { error: result.error };
	}

	return result;
}

export async function deleteTodo(
	todosDir: string,
	id: string,
	ctx: ExtensionContext,
): Promise<TodoRecord | { error: string }> {
	const validated = validateTodoId(id);
	if ("error" in validated) {
		return { error: validated.error };
	}
	const normalizedId = validated.id;
	const filePath = getTodoPath(todosDir, normalizedId);
	if (!existsSync(filePath)) {
		return { error: `Todo ${displayTodoId(id)} not found` };
	}

	const result = await withTodoLock(todosDir, normalizedId, ctx, async () => {
		const existing = await ensureTodoExists(filePath, normalizedId);
		if (!existing) return { error: `Todo ${displayTodoId(id)} not found` } as const;
		await fs.unlink(filePath);
		return existing;
	});

	if (typeof result === "object" && "error" in result) {
		return { error: result.error };
	}

	return result;
}
