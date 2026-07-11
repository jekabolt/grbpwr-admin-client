import { TaskInsert } from '../api/types';

export type LinkKind = 'techcard' | 'product' | 'order' | 'archive' | 'fitting';

export interface TaskLink {
  kind: LinkKind;
  id: number; // entity id (0 for order, which is keyed by uuid)
  orderUuid?: string;
  label: string; // fallback label ("#id") when the name isn't resolved
  to: string; // in-app route to the linked entity
}

// Derives the set of typed links attached to a task and the admin route each
// deep-links to. The `label` is the id fallback; LinkChip resolves the real name
// via the entity's single-get RPC when available.
export function taskLinks(t: TaskInsert): TaskLink[] {
  const links: TaskLink[] = [];
  if (t.techCardId > 0)
    links.push({
      kind: 'techcard',
      id: t.techCardId,
      label: `техкарта #${t.techCardId}`,
      to: `/tech-cards/${t.techCardId}`,
    });
  if (t.productId > 0)
    links.push({
      kind: 'product',
      id: t.productId,
      label: `product #${t.productId}`,
      to: `/products/${t.productId}`,
    });
  if (t.orderUuid)
    links.push({
      kind: 'order',
      id: 0,
      orderUuid: t.orderUuid,
      label: `order ${t.orderUuid.slice(0, 8)}`,
      to: `/orders/${t.orderUuid}`,
    });
  // The timeline detail route needs heading+tag+id; without resolving them we
  // deep-link to the archive list.
  if (t.archiveId > 0)
    links.push({
      kind: 'archive',
      id: t.archiveId,
      label: `drop #${t.archiveId}`,
      to: `/archives`,
    });
  if (t.fittingId > 0)
    links.push({
      kind: 'fitting',
      id: t.fittingId,
      label: `примерка #${t.fittingId}`,
      to: `/fittings/${t.fittingId}`,
    });
  return links;
}

export function taskLinkCount(t: TaskInsert): number {
  return (
    (t.techCardId > 0 ? 1 : 0) +
    (t.productId > 0 ? 1 : 0) +
    (t.orderUuid ? 1 : 0) +
    (t.archiveId > 0 ? 1 : 0) +
    (t.fittingId > 0 ? 1 : 0)
  );
}
