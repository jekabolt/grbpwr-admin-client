import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { listLibraryFolders } from '../api/library';
import type { LibraryFilter, LibraryFolder } from '../api/types';
import { libraryKeys } from './keys';

export type FolderNode = {
  id: number;
  /** 0 = root. */
  parentId: number;
  name: string;
  /** Direct items visible to the caller under the filter. */
  itemCount: number;
  childCount: number;
  /** 0 for a root folder. */
  depth: number;
  children: FolderNode[];
};

const byName = (a: FolderNode, b: FolderNode) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });

/**
 * The flat server list as a tree. A folder whose parent is missing from the list is put at
 * the root, never dropped; a parent loop (should not exist) is broken the same way.
 */
export function buildTree(folders: LibraryFolder[]): FolderNode[] {
  const nodes = new Map<number, FolderNode>();
  for (const f of folders) {
    const id = f.id ?? 0;
    if (!id) continue;
    nodes.set(id, {
      id,
      parentId: f.parentId ?? 0,
      name: f.name ?? '',
      itemCount: f.itemCount ?? 0,
      childCount: f.childCount ?? 0,
      depth: 0,
      children: [],
    });
  }
  const roots: FolderNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  // Depth and order from the roots down; nodes never reached (a loop) become roots.
  const reached = new Set<number>();
  const walk = (list: FolderNode[], depth: number) => {
    list.sort(byName);
    for (const n of list) {
      if (reached.has(n.id)) continue;
      reached.add(n.id);
      n.depth = depth;
      walk(n.children, depth + 1);
    }
  };
  walk(roots, 0);
  for (const node of nodes.values()) {
    if (reached.has(node.id)) continue;
    const parent = nodes.get(node.parentId);
    if (parent) parent.children = parent.children.filter((c) => c !== node);
    roots.push(node);
    walk([node], 0);
  }
  roots.sort(byName);
  return roots;
}

/** Depth-first order of the tree (rail rows, folder combobox options). */
export function flattenTree(tree: FolderNode[]): FolderNode[] {
  const out: FolderNode[] = [];
  const walk = (list: FolderNode[]) => {
    for (const n of list) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(tree);
  return out;
}

/** Ids of the folder and everything under it. */
export function subtreeIds(node: FolderNode): number[] {
  return flattenTree([node]).map((n) => n.id);
}

/** Root → folder names, for a breadcrumb or a combobox label. */
export function folderPath(byId: Map<number, FolderNode>, id: number): FolderNode[] {
  const path: FolderNode[] = [];
  const seen = new Set<number>();
  let cur = byId.get(id);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return path;
}

export function useLibraryFolders(filter: LibraryFilter, opts?: { enabled?: boolean }) {
  const query = useQuery({
    queryKey: libraryKeys.folders(filter),
    queryFn: async () => (await listLibraryFolders(filter)).folders ?? [],
    enabled: opts?.enabled ?? true,
    staleTime: 60 * 1000,
  });
  const folders = query.data;
  const tree = useMemo(() => buildTree(folders ?? []), [folders]);
  const byId = useMemo(() => new Map(flattenTree(tree).map((n) => [n.id, n])), [tree]);
  return { ...query, folders: folders ?? [], tree, byId };
}
