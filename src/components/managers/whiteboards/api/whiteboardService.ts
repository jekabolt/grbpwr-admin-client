// whiteboardService is the single seam between the whiteboard UI and the backend
// (docs/kanban-tasks-plan.md §0). Its methods mirror the future AdminService RPCs one to one
// (CLAUDE.md → Backend → RPCs), so hooks and components never change when it is flipped.
//
// UNTIL THE BACKEND SHIPS it is backed by localStorage: one browser, one person, nothing shared —
// the editor says so with its LOCAL pill. The flip replaces the bodies below with
// `adminService.*Whiteboard*` calls and deletes `setLocalActor`; the signatures stay.
import { ListWhiteboardsFilter, UNTITLED, Whiteboard, WhiteboardInsert } from './types';

const STORE_KEY = 'whiteboards:v1';

// The real RPCs read the author from the JWT. Locally the hook tells the adapter who is calling,
// once the account is known; before that the author is blank, and «mine» matches nothing.
let localActor = '';
export function setLocalActor(username: string) {
  localActor = username;
}

function readAll(): Whiteboard[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Whiteboard[]) : [];
  } catch {
    // A corrupt or blocked store reads as empty rather than taking the screen down.
    return [];
  }
}

function writeAll(rows: Whiteboard[]) {
  localStorage.setItem(STORE_KEY, JSON.stringify(rows));
}

function notFound(uuid: string): Error {
  return new Error(`whiteboard ${uuid} not found`);
}

const now = () => new Date().toISOString();

function newUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

function patch(uuid: string, change: (w: Whiteboard) => Whiteboard): Whiteboard {
  const rows = readAll();
  const i = rows.findIndex((w) => w.uuid === uuid);
  if (i < 0) throw notFound(uuid);
  rows[i] = change(rows[i]);
  writeAll(rows);
  return rows[i];
}

export const whiteboardService = {
  async ListWhiteboards(filter: ListWhiteboardsFilter = {}): Promise<Whiteboard[]> {
    const search = filter.search?.trim().toLowerCase() ?? '';
    return readAll()
      .filter((w) => !!w.archivedAt === !!filter.archived)
      .filter((w) => !filter.createdBy || w.createdBy === filter.createdBy)
      .filter((w) => !search || (w.title || UNTITLED).toLowerCase().includes(search))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async GetWhiteboard(uuid: string): Promise<Whiteboard> {
    const found = readAll().find((w) => w.uuid === uuid);
    if (!found) throw notFound(uuid);
    return found;
  },

  async AddWhiteboard(insert: WhiteboardInsert): Promise<Whiteboard> {
    const at = now();
    const row: Whiteboard = {
      uuid: newUuid(),
      title: insert.title.trim(),
      createdBy: localActor,
      createdAt: at,
      updatedBy: localActor,
      updatedAt: at,
      archivedAt: '',
    };
    writeAll([row, ...readAll()]);
    return row;
  },

  async UpdateWhiteboard(uuid: string, insert: WhiteboardInsert): Promise<Whiteboard> {
    return patch(uuid, (w) => ({
      ...w,
      title: insert.title.trim(),
      updatedBy: localActor,
      updatedAt: now(),
    }));
  },

  async ArchiveWhiteboard(uuid: string, archived: boolean): Promise<Whiteboard> {
    return patch(uuid, (w) => ({ ...w, archivedAt: archived ? now() : '' }));
  },

  async DeleteWhiteboard(uuid: string): Promise<void> {
    const rows = readAll();
    if (!rows.some((w) => w.uuid === uuid)) throw notFound(uuid);
    writeAll(rows.filter((w) => w.uuid !== uuid));
  },
};
