/**
 * This extension stores todo items as files under <todo-dir> (defaults to .pi/todos,
 * or the path in PI_TODO_PATH).  Each todo is a standalone markdown file named
 * <id>.md and an optional <id>.lock file is used while a session is editing it.
 *
 * File format in .pi/todos:
 * - The file starts with a JSON object (not YAML) containing the front matter:
 *   { id, title, tags, status, created_at, assigned_to_session }
 * - After the JSON block comes optional markdown body text separated by a blank line.
 * - Example:
 *   {
 *     "id": "deadbeef",
 *     "title": "Add tests",
 *     "tags": ["qa"],
 *     "status": "open",
 *     "created_at": "2026-01-25T17:00:00.000Z",
 *     "assigned_to_session": "session.json"
 *   }
 *
 *   Notes about the work go here.
 *
 * Todo storage settings are kept in <todo-dir>/settings.json.
 * Defaults:
 * {
 *   "gc": true,   // delete closed todos older than gcDays on startup
 *   "gcDays": 7   // age threshold for GC (days since created_at)
 * }
 *
 * Use `/todos` to bring up the visual todo manager or just let the LLM use them
 * naturally.
 */
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";

// ── Constants ────────────────────────────────────────────────────────────────

export const TODO_DIR_NAME = ".pi/todos";
export const TODO_PATH_ENV = "PI_TODO_PATH";
export const TODO_SETTINGS_NAME = "settings.json";
export const TODO_ID_PREFIX = "TODO-";
export const TODO_ID_PATTERN = /^[a-f0-9]{8}$/i;
export const LOCK_TTL_MS = 30 * 60 * 1000;

export const DEFAULT_TODO_SETTINGS = {
	gc: true,
	gcDays: 7,
};

// ── Status ───────────────────────────────────────────────────────────────────

export const TodoStatus = {
	OPEN: "open",
	CLOSED: "closed",
	DONE: "done",
} as const;

export type TodoStatus = (typeof TodoStatus)[keyof typeof TodoStatus];

export const CLOSED_STATUSES = new Set([TodoStatus.CLOSED, TodoStatus.DONE]);

// ── Interfaces ───────────────────────────────────────────────────────────────

export interface TodoFrontMatter {
	id: string;
	title: string;
	tags: string[];
	status: string;
	created_at: string;
	assigned_to_session?: string;
}

export interface TodoRecord extends TodoFrontMatter {
	body: string;
}

export interface LockInfo {
	id: string;
	pid: number;
	session?: string | null;
	created_at: string;
}

export interface TodoSettings {
	gc: boolean;
	gcDays: number;
}

// ── Type Aliases ─────────────────────────────────────────────────────────────

export type KeybindingMatcher = {
	matches: (keyData: string, keybindingId: string) => boolean;
};

export type TodoAction =
	| "list"
	| "list-all"
	| "get"
	| "create"
	| "update"
	| "append"
	| "delete"
	| "claim"
	| "release";

export type TodoOverlayAction = "back" | "work";

export type TodoMenuAction =
	| "work"
	| "refine"
	| "close"
	| "reopen"
	| "release"
	| "delete"
	| "copyPath"
	| "copyText"
	| "view";

export type TodoToolDetails =
	| { action: "list" | "list-all"; todos: TodoFrontMatter[]; currentSessionId?: string; error?: string }
	| {
			action: "get" | "create" | "update" | "append" | "delete" | "claim" | "release";
			todo: TodoRecord;
			error?: string;
		};

// ── TypeBox Schema ───────────────────────────────────────────────────────────

export const TodoParams = Type.Object({
	action: StringEnum([
		"list",
		"list-all",
		"get",
		"create",
		"update",
		"append",
		"delete",
		"claim",
		"release",
	] as const),
	id: Type.Optional(
		Type.String({ description: "Todo id (TODO-<hex> or raw hex filename)" }),
	),
	title: Type.Optional(Type.String({ description: "Short summary shown in lists" })),
	status: Type.Optional(Type.String({ description: "Todo status" })),
	tags: Type.Optional(Type.Array(Type.String({ description: "Todo tag" }))),
	body: Type.Optional(
		Type.String({ description: "Long-form details (markdown). Update replaces; append adds." }),
	),
	force: Type.Optional(Type.Boolean({ description: "Override another session's assignment" })),
});

// ── ID Helpers ───────────────────────────────────────────────────────────────

export function formatTodoId(id: string): string {
	return `${TODO_ID_PREFIX}${id}`;
}

export function normalizeTodoId(id: string): string {
	let trimmed = id.trim();
	if (trimmed.startsWith("#")) {
		trimmed = trimmed.slice(1);
	}
	if (trimmed.toUpperCase().startsWith(TODO_ID_PREFIX)) {
		trimmed = trimmed.slice(TODO_ID_PREFIX.length);
	}
	return trimmed;
}

export function validateTodoId(id: string): { id: string } | { error: string } {
	const normalized = normalizeTodoId(id);
	if (!normalized || !TODO_ID_PATTERN.test(normalized)) {
		return { error: "Invalid todo id. Expected TODO-<hex>." };
	}
	return { id: normalized.toLowerCase() };
}

export function displayTodoId(id: string): string {
	return formatTodoId(normalizeTodoId(id));
}

// ── Status Helpers ───────────────────────────────────────────────────────────

export function isTodoClosed(status: string): boolean {
	return CLOSED_STATUSES.has(status.toLowerCase());
}

export function getTodoStatus(todo: TodoFrontMatter): string {
	return todo.status || TodoStatus.OPEN;
}

export function clearAssignmentIfClosed(todo: TodoFrontMatter): void {
	if (isTodoClosed(getTodoStatus(todo))) {
		todo.assigned_to_session = undefined;
	}
}
