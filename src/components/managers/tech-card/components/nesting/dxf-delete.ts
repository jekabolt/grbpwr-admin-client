// Удаление листа выкройки с каскадом (L6b): что форма пишет, когда оператор жмёт × на строке DXF.
// Чисто — ни React, ни сети: панель выкроек (patterns-field.tsx) и проверка
// (scripts/dxf-reupload-check.mjs) зовут одну и ту же функцию.
//
//   · строка не DXF (PDF) или без файла — как раньше: просто убрать строку;
//   · строка DXF — removeSheetCascade: уходят детали только этого листа, шаги с ними и всё ниже по
//     течению; номера оставшихся шагов сдвигаются, дефекты ушедших шагов получают номер 0 — ровно
//     как при удалении шага в редакторе (OperationsField.removeOperation → remapIssues);
//   · ссылки вне сборки (колорвеи, площади) не трогаются: сервер скажет своими словами.
import type { CardAlias, CardOperation, CardPiece } from 'lib/dxf-reconcile';
import {
  removeSheetCascade,
  type CascadeBlock,
  type CascadeRef,
  type CascadeSeam,
  type CascadeSheet,
} from 'lib/dxf-reconcile';
import { sheetRowId, type ReuploadSheetRow } from './dxf-reupload';

/** Причина снимка у сохранения, несущего удаление листа: restore в versions его отменяет. */
export const DELETE_SNAPSHOT_REASON = 'dxf-delete';

export type DeleteSheetCard<
  P extends CardPiece,
  A extends CardAlias,
  O extends CardOperation,
  S extends CascadeSeam = CascadeSeam,
> = {
  patterns: readonly ReuploadSheetRow[];
  pieces: readonly P[];
  aliases: readonly A[];
  operations: readonly O[];
  issues?: readonly { operationNumber?: number }[];
  seams?: readonly S[];
  /** ссылки на детали вне сборки (строки рецепта колорвеев, площади) — только называются */
  refs?: readonly CascadeRef[];
  /** ключ scope привязки листа/алиаса (scopeKeyOfBinding формы над набором своего вида) */
  scopeOf: (b: { fabricPurpose?: string; bomLineKey?: string }, kind: 'sheet' | 'link') => string;
  isDxf: (url: string | undefined) => boolean;
  sizeTokens?: readonly string[];
  /** имена блоков листа по url (разбор панели); null/undefined — не известны */
  blockNamesOf?: (url: string) => readonly string[] | null | undefined;
};

export type DeleteSheetPlan<P, A, O> =
  | { kind: 'missing' }
  | { kind: 'plain'; rowIndex: number }
  | {
      kind: 'cascade';
      rowIndex: number;
      rowUrl: string;
      pieces: P[];
      aliases: A[];
      operations: O[];
      /** номер шага каждого дефекта ВХОДА после удаления (0 — его шаг ушёл) */
      issueNumbers: number[];
      removedSeamIds: string[];
      blockedBy: CascadeBlock[];
      counts: { pieces: number; steps: number };
    };

/** Что сделать с формой, если удалить строку листа `rowId` (sheetRowId). */
export function planSheetDelete<
  P extends CardPiece,
  A extends CardAlias,
  O extends CardOperation,
  S extends CascadeSeam = CascadeSeam,
>(card: DeleteSheetCard<P, A, O, S>, rowId: string): DeleteSheetPlan<P, A, O> {
  const want = rowId.trim();
  const rowIndex = want ? card.patterns.findIndex((r) => sheetRowId(r) === want) : -1;
  if (rowIndex < 0) return { kind: 'missing' };
  const row = card.patterns[rowIndex];
  const url = (row.url ?? '').trim();
  if (!url || !card.isDxf(url)) return { kind: 'plain', rowIndex };

  const sheets: CascadeSheet[] = card.patterns
    .filter((r) => (r.url ?? '').trim() && card.isDxf(r.url))
    .map((r) => ({
      key: sheetRowId(r),
      scope: { fabricPurpose: r.fabricPurpose, bomLineKey: r.bomLineKey },
      blockNames: card.blockNamesOf?.((r.url ?? '').trim()) ?? null,
    }));
  const res = removeSheetCascade(
    {
      pieces: card.pieces,
      aliases: card.aliases,
      operations: card.operations,
      sheets,
      issues: card.issues,
      seams: card.seams,
      refs: card.refs,
      sizeTokens: card.sizeTokens,
      scopeKeyOf: card.scopeOf,
    },
    want,
  );
  if (!res.found) return { kind: 'plain', rowIndex };

  // Правило OperationsField.remapIssues с mapIndex = opIndexOf: позиционна только ссылка, которую
  // мог выдать редактор (кратная 10 внутри ряда); ушедший шаг → 0, остальное не трогается.
  const opCount = card.operations.length;
  const issueNumbers = (card.issues ?? []).map((iss) => {
    const n = iss.operationNumber ?? 0;
    if (!n || n % 10 !== 0) return n;
    const old = n / 10 - 1;
    if (old < 0 || old >= opCount) return n;
    const next = res.opIndexOf[old];
    return next == null ? 0 : (next + 1) * 10;
  });

  return {
    kind: 'cascade',
    rowIndex,
    rowUrl: url,
    pieces: res.pieces,
    aliases: res.aliases,
    operations: res.operations,
    issueNumbers,
    removedSeamIds: res.removedSeamIds.filter(Boolean),
    blockedBy: res.blockedBy,
    counts: res.counts,
  };
}
