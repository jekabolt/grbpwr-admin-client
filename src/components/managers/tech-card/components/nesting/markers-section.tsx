// Сохранённые раскладки (маркеры) карточки — the fourth Section of the patterns tab.
// Summaries ride GetTechCard; the geometry blob is fetched only when a marker is opened
// (GetTechCardMarker → NestingModal in view mode, same lazy chunk as the nesting itself).
import { useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { common_TechCard, common_TechCardMarker } from 'api/proto-http/admin';
import { useSizeNames } from 'components/managers/model/components/use-size-systems';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';
import { colorwayLabelOf } from './colorway-widths';
import { formatTechCardDate } from 'components/managers/tech-cards/components/utils';
import { useSnackBarStore } from 'lib/stores/store';
import { Suspense, lazy, useMemo, useState } from 'react';
import { useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { DataTable, EmptyCell } from 'ui/components/data-table';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { consumptionCm, decNum } from './marker-io';
import {
  isRollGoodsSection,
  markerScopeDirection,
  type ScopeDirection,
} from '../bom-purpose';
import type { TechCardFormData } from '../schema';

const NestingModal = lazy(() =>
  import('./nesting-modal').then((m) => ({ default: m.NestingModal })),
);

const SOURCE_LABEL: Record<string, string> = {
  auto: 'авто',
  manual: 'ручная',
  imported: 'импорт',
};

export function MarkersSection({
  techCard,
  techCardId,
  canEdit,
}: {
  techCard?: common_TechCard;
  techCardId: number;
  canEdit: boolean;
}) {
  const markers = techCard?.markers ?? [];
  // Колорвей маркера — имя, а не id. Без него две раскладки одного слота на разных ширинах
  // различаются только числом в колонке «ширина», и понять, которая из них чья, нельзя.
  const colorwayLabelById = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of techCard?.colorways ?? []) {
      const id = Number(c.colorwayId ?? 0);
      if (id) m.set(id, colorwayLabelOf(c));
    }
    return m;
  }, [techCard?.colorways]);
  const sizeById = useSizeNames();
  const season = (useWatch<TechCardFormData>({ name: 'season' }) ?? '') as string;
  const styleNumber = (useWatch<TechCardFormData>({ name: 'styleNumber' }) ?? '') as string;
  // НАПРАВЛЕНИЕ ТКАНИ ОТКРЫТОГО МАРКЕРА. Раньше сюда не передавалось ничего, и модалка вдобавок
  // подменяла его на 'unknown' в режиме просмотра — то есть ручной редактор ПРЕДЛАГАЛ поставить
  // деталь на 180° на ворсовой ткани. Правка старого маркера с таким поворотом уходила в базу:
  // сервер милует строки, чьё поколение политики младше 3, и поколение при этом не двигает, так
  // что строка остаётся помилованной навсегда. Помилование, заведённое защищать старые ЗАМЕРЫ,
  // начинало узаконивать новый брак — и именно на старых строках, ради которых и заводилось.
  //
  // Скоуп резолвится тут, а не в модалке: BOM карточки под рукой только здесь.
  const bomItems = (useWatch<TechCardFormData>({ name: 'bomItems' }) ?? []) as Array<{
    section?: string;
    lineKey?: string;
    purpose?: string;
    fabricDirection?: string;
    isSample?: boolean;
  }>;
  const rollGoodsLines = useMemo(
    () =>
      bomItems
        .filter((b) => isRollGoodsSection(b.section) && b.lineKey)
        .map((b) => ({
          lineKey: b.lineKey as string,
          purpose: b.purpose ?? '',
          fabricDirection: b.fabricDirection ?? '',
          isSample: !!b.isSample,
        })),
    [bomItems],
  );
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();

  const [view, setView] = useState<common_TechCardMarker | null>(null);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<{ id: number; name: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  // Непривязанная раскладка — 'unknown': ткани у неё нет, спрашивать не у чего, и с белым списком
  // allowsFlip это значит «переворот не предлагаем», что для геометрии без цели и правильно.
  const viewDirection: ScopeDirection = useMemo(
    () => markerScopeDirection(view?.summary?.bomLineKey ?? '', rollGoodsLines),
    [view?.summary?.bomLineKey, rollGoodsLines],
  );

  const openMarker = async (id: number) => {
    setOpeningId(id);
    try {
      const r = await adminService.GetTechCardMarker({ id });
      if (r.marker) setView(r.marker);
      else showMessage('маркер не найден', 'error');
    } catch (e) {
      showMessage(e instanceof Error && e.message ? e.message : 'не удалось открыть маркер', 'error');
    } finally {
      setOpeningId(null);
    }
  };

  const deleteMarker = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await adminService.DeleteTechCardMarker({ id: deleting.id });
      showMessage('маркер удалён', 'success');
      qc.invalidateQueries({ queryKey: techCardKeys.detail(techCardId) });
      qc.invalidateQueries({ queryKey: techCardKeys.lists() });
      setDeleting(null);
    } catch (e) {
      showMessage(e instanceof Error && e.message ? e.message : 'не удалось удалить маркер', 'error');
    } finally {
      setDeleteBusy(false);
    }
  };

  if (markers.length === 0) {
    return (
      <Text size='micro' variant='label'>
        сохранённых раскладок нет — запустите «⌗ раскладка» на плитке размера и нажмите
        «сохранить раскладку»
      </Text>
    );
  }

  return (
    <div className='space-y-2'>
      <div className='overflow-x-auto'>
        <DataTable variant='grid' className='[&_td]:text-micro [&_th]:text-nano'>
          <thead>
            <tr>
              <th>название</th>
              <th>размер</th>
              <th>слот BOM</th>
              <th>ширина</th>
              <th>длина</th>
              <th>компл.</th>
              <th>расход / ед</th>
              <th>эфф.</th>
              <th>обновлён</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {markers.map((m) => {
              const cons = consumptionCm(m);
              return (
                <tr key={m.id}>
                  <td>
                    <span className='inline-flex items-center gap-1.5'>
                      <span className='max-w-[180px] truncate'>{m.name}</span>
                      <Pill tone='mut'>{SOURCE_LABEL[m.source ?? ''] ?? m.source}</Pill>
                    </span>
                  </td>
                  <td>{formatSizeName(sizeById.get(m.sizeId ?? 0) ?? `#${m.sizeId}`)}</td>
                  <td>
                    {/* The wire cannot tell «never linked» from «slot deleted» (both come
                        from the same LEFT JOIN going NULL) — one honest label, no fake pill. */}
                    {m.bomItemName || (
                      <Text size='nano' variant='label' component='span'>
                        не привязан / удалён
                      </Text>
                    )}
                    {/* «общая» — это НЕ отсутствие данных: маркер снят до 0264 или ширина у всех
                        колорвеев одна, и такая раскладка законно предлагается каждому. Пустая
                        ячейка читалась бы как недозаполненная. */}
                    <span className='block text-nano text-labelColor'>
                      {colorwayLabelById.get(Number(m.colorwayId ?? 0)) ??
                        (Number(m.colorwayId ?? 0) ? 'колорвей не в карточке' : 'общая')}
                    </span>
                  </td>
                  <td>{decNum(m.fabricWidthCm)} см</td>
                  <td>{decNum(m.usedLengthCm)} см</td>
                  <td>{m.sets ?? 1}</td>
                  <td className='font-semibold'>{cons ? `${cons} см` : <EmptyCell />}</td>
                  <td>{decNum(m.efficiencyPct) ? `${decNum(m.efficiencyPct)} %` : <EmptyCell />}</td>
                  <td>
                    <span title={m.updatedBy || ''}>{formatTechCardDate(m.updatedAt)}</span>
                  </td>
                  <td>
                    <span className='inline-flex gap-1'>
                      <Button
                        type='button'
                        variant='secondary'
                        size='xs'
                        disabled={openingId === m.id}
                        onClick={() => openMarker(m.id ?? 0)}
                      >
                        {openingId === m.id ? 'открываем…' : 'открыть'}
                      </Button>
                      {canEdit && (
                        <Button
                          type='button'
                          variant='secondary'
                          size='xs'
                          aria-label='удалить маркер'
                          onClick={() => setDeleting({ id: m.id ?? 0, name: m.name ?? '' })}
                        >
                          ✕
                        </Button>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </div>

      {view && (
        <Suspense
          fallback={
            <Text size='micro' variant='label'>
              загрузка модуля раскладки…
            </Text>
          }
        >
          <NestingModal
            files={null}
            view={view}
            techCardId={techCardId}
            canEdit={canEdit}
            sizeLabel={formatSizeName(
              sizeById.get(view.summary?.sizeId ?? 0) ?? `#${view.summary?.sizeId ?? 0}`,
            )}
            season={season}
            styleNumber={styleNumber}
            // Направление РЕАЛЬНОЙ ткани этого маркера. Ручной редактор предлагает повороты по
            // нему, поэтому на ворсовой строке 180° он больше не предложит. Уже лежащий в блобе
            // поворот при этом никуда не денется — rotsFor всегда держит текущий в цикле.
            fabricDirection={viewDirection}
            onClose={() => setView(null)}
          />
        </Suspense>
      )}

      <ConfirmationModal
        open={deleting != null}
        onOpenChange={(o) => {
          if (!o && !deleteBusy) setDeleting(null);
        }}
        onConfirm={deleteMarker}
        onCancel={() => {
          if (!deleteBusy) setDeleting(null);
        }}
        title='удалить маркер?'
        confirmLabel={deleteBusy ? 'удаляем…' : 'удалить'}
        confirmDisabled={deleteBusy}
        closeOnConfirm={false}
      >
        <Text size='micro' component='p'>
          «{deleting?.name}» будет удалён насовсем. Записанный в рецепты расход не изменится —
          пропадёт только сам маркер и его подсказка в костинге.
        </Text>
      </ConfirmationModal>
    </div>
  );
}
