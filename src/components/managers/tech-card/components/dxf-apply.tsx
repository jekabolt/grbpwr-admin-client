// «По выкройкам» — ЛЁГКАЯ ПОЛОВИНА: кнопка на строке рецепта и разрешение «есть ли чем считать».
//
// Тяжёлое (скачивание выкроек, воркерный разбор, замер припуска, геометрия слоёв) живёт в
// dxf-apply-dialog.tsx и приезжает ДИНАМИЧЕСКИМ импортом, только когда диалог открыли. Причина ровно
// та же, по которой marker-apply тянет площади через `await import(...)`: этот файл лежит в чанке
// рецепта, который загружается при открытии вкладки колорвеев на КАЖДОЙ карточке, а платить за
// геометрию должен тот, кто её попросил. Диалог монтируется только открытым — сам факт монтирования
// и есть «взвести разбор», поэтому внутри него нет ни одного флага про это.
//
// Что решается ЗДЕСЬ и не может быть отложено: показывать ли кнопку вообще. Ответ читается из формы
// карточки (BOM, детали кроя, связи блоков) и не требует ни одного байта геометрии.
import { lazy, Suspense, useMemo, useState } from 'react';
import { useWatch, type Control } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { fabricScopes, isRollGoodsSection } from './bom-purpose';
import type { DxfNormPiece } from './nesting/dxf-consumption';
import type { TechCardFormData } from './schema';

const DxfApplyDialog = lazy(() => import('./dxf-apply-dialog'));

type PieceRow = {
  lineKey?: string;
  name?: string;
  piecesPerGarment?: number;
  materials?: { bomLineKey?: string; fusingBomLineKey?: string }[];
};
type AliasRow = {
  pieceLineKey?: string;
  blockName?: string;
  bomLineKey?: string;
  fabricPurpose?: string;
};
type BomRow = { lineKey?: string; section?: string; purpose?: string; name?: string };

export function DxfApplyHint({
  control,
  lineKey,
  unit,
  wastagePercent,
  articleWidth,
  sizeIds,
  sizeNameById,
  canEdit,
  onApply,
}: {
  control: Control<TechCardFormData>;
  lineKey: string;
  unit: string;
  /** Процент раскроя слота. Пустой = применять нельзя (netto без него занижает закупку). */
  wastagePercent: string;
  /** РАСКРОЙНАЯ ширина эффективного артикула, см (рулон − 2×кромка). '' = неизвестна. */
  articleWidth: string;
  sizeIds: number[];
  sizeNameById: Map<number, string>;
  canEdit: boolean;
  onApply: (patch: {
    consumption?: string;
    quantity?: string;
    sizeConsumptions?: { sizeId: number; consumption: string }[];
    consumptionSource?: string;
    wasteSelvedgePct?: string;
    wasteCutPct?: string;
    normMarkerId?: number;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const bomRows = (useWatch({ control, name: 'bomItems' }) ?? []) as BomRow[];
  const pieceRows = (useWatch({ control, name: 'pieces' }) ?? []) as PieceRow[];
  const aliasRows = (useWatch({ control, name: 'pieceDxfAliases' }) ?? []) as AliasRow[];

  // Скоупы ткани считаются ОДИН раз на строку: с 0267 и лист выкройки, и связь блок→деталь
  // привязаны к НАЗНАЧЕНИЮ, а не к строке BOM, поэтому фильтр по одному lineKey теряет листы
  // «основного материала» и отвечает «выкроек нет» там, где они загружены.
  const scopes = useMemo(
    () =>
      fabricScopes(
        bomRows
          .filter((b) => isRollGoodsSection(b.section) && !!b.lineKey)
          .map((b) => ({ lineKey: b.lineKey as string, purpose: b.purpose, name: b.name })),
      ),
    [bomRows],
  );
  const scopeKey = useMemo(
    () => scopes.find((s) => s.lines.some((l) => l.lineKey === lineKey))?.key ?? '',
    [scopes, lineKey],
  );

  // КОМПЛЕКТ ДЕТАЛЕЙ СЧИТАЕТСЯ ПО ПРИВЯЗКЕ «ДЕТАЛЬ → ТКАНЬ», А НЕ ПО АЛИАСАМ, и это главное решение
  // этого файла. Ткань детали заявлена на самой детали (`pieces[].materials[].bomLineKey`); связь с
  // блоком чертежа (алиас) — отдельный факт, которого может не быть. Собери комплект по алиасам, и
  // деталь этой же ткани, которую просто забыли связать, молча выпадет из площади — площадь станет
  // меньше, норма меньше, а обнаружится это на складе. Поэтому непривязанные детали не
  // выбрасываются, а НАЗЫВАЮТСЯ и расчёт на них отказывает (см. dxfNormAreas).
  //
  // Количество на изделие — тоже из карточки. Сколько экземпляров блока лежит в файле, не
  // спрашиваем принципиально: две ревизии одного листа читались бы как «деталь идёт по две».
  const { pieces, unaliasedPieces } = useMemo(() => {
    if (!scopeKey) return { pieces: [] as DxfNormPiece[], unaliasedPieces: [] as string[] };
    const byPiece = new Map<string, { block: string; scopeKey: string }[]>();
    for (const a of aliasRows) {
      const key = (a.pieceLineKey ?? '').trim().toLowerCase();
      const block = (a.blockName ?? '').trim();
      if (!key || !block) continue;
      const purpose = (a.fabricPurpose ?? '').trim();
      const own = purpose
        ? scopes.find((s) => s.byPurpose && s.key === purpose)
        : scopes.find((s) => s.lines.some((l) => l.lineKey === (a.bomLineKey ?? '').trim()));
      if ((own?.key ?? '') !== scopeKey) continue;
      const list = byPiece.get(key) ?? [];
      if (!list.some((r) => r.block === block)) list.push({ block, scopeKey });
      byPiece.set(key, list);
    }
    const out: DxfNormPiece[] = [];
    const missing: string[] = [];
    for (const p of pieceRows) {
      const key = (p.lineKey ?? '').trim().toLowerCase();
      if (!key) continue;
      // Деталь принадлежит ЭТОЙ ткани, если хоть одна её строка материалов ссылается на слот этого
      // скоупа. Дублирование (`fusingBomLineKey`) сюда НЕ входит: клеевая — другая ткань, у неё свой
      // слот и своя норма.
      const ownsScope = (p.materials ?? []).some((m) => {
        const line = (m.bomLineKey ?? '').trim();
        if (!line) return false;
        return (
          (scopes.find((s) => s.lines.some((l) => l.lineKey === line))?.key ?? '') === scopeKey
        );
      });
      if (!ownsScope) continue;
      const refs = byPiece.get(key);
      const name = p.name?.trim() || key;
      if (!refs || refs.length === 0) {
        missing.push(name);
        continue;
      }
      out.push({
        name,
        perGarment: Math.max(1, Math.round(Number(p.piecesPerGarment ?? 1) || 1)),
        refs,
      });
    }
    return { pieces: out, unaliasedPieces: missing };
  }, [aliasRows, pieceRows, scopes, scopeKey]);

  // Кнопки нет, когда предлагать нечего: без деталей этой ткани и без размерного ряда диалог ответил
  // бы отказом на каждое открытие — а кнопка, которая всегда отказывает, читается как поломка, а не
  // как отсутствие данных. Непривязанные детали кнопку НЕ гасят: там отказ содержательный и
  // называет, что именно связать.
  if (pieces.length + unaliasedPieces.length === 0 || sizeIds.length === 0) return null;

  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      <Button type='button' variant='secondary' size='xs' onClick={() => setOpen(true)}>
        по выкройкам…
      </Button>
      <Text size='nano' variant='label' component='span'>
        площадь деталей ÷ раскройная ширина — netto, без межлекальных выпадов
      </Text>
      {open && (
        <Suspense fallback={null}>
          <DxfApplyDialog
            control={control}
            pieces={pieces}
            unaliasedPieces={unaliasedPieces}
            unit={unit}
            wastagePercent={wastagePercent}
            articleWidth={articleWidth}
            sizeIds={sizeIds}
            sizeNameById={sizeNameById}
            canEdit={canEdit}
            onClose={() => setOpen(false)}
            onApply={onApply}
          />
        </Suspense>
      )}
    </div>
  );
}
