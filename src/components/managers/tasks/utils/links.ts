import { TaskInsert } from '../api/types';

export type LinkKind = 'techcard' | 'product' | 'order' | 'archive';

export interface TaskLink {
  kind: LinkKind;
  label: string;
  to: string; // in-app route to the linked entity
}

// Derives the set of typed links attached to a task and the admin route each
// deep-links to. Names aren't resolved here (kept robust/decoupled) — the id is
// shown and clicking navigates to the entity's screen.
export function taskLinks(t: TaskInsert): TaskLink[] {
  const links: TaskLink[] = [];
  if (t.techCardId > 0)
    links.push({ kind: 'techcard', label: `техкарта #${t.techCardId}`, to: `/tech-cards/${t.techCardId}` });
  if (t.productId > 0)
    links.push({ kind: 'product', label: `product #${t.productId}`, to: `/products/${t.productId}` });
  if (t.orderUuid)
    links.push({ kind: 'order', label: `order ${t.orderUuid.slice(0, 8)}`, to: `/orders/${t.orderUuid}` });
  // The timeline detail route needs heading+tag+id; without resolving them we
  // deep-link to the archive list.
  if (t.archiveId > 0) links.push({ kind: 'archive', label: `drop #${t.archiveId}`, to: `/archives` });
  return links;
}

export function taskLinkCount(t: TaskInsert): number {
  return (
    (t.techCardId > 0 ? 1 : 0) +
    (t.productId > 0 ? 1 : 0) +
    (t.orderUuid ? 1 : 0) +
    (t.archiveId > 0 ? 1 : 0)
  );
}
