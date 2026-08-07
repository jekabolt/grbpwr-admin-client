import { common_ProductionLayMode, common_TechCardMarkerSummary } from 'api/proto-http/admin';
import { Button } from 'ui/components/button';
import { DataTable, EmptyCell } from 'ui/components/data-table';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { ulid } from 'utils/ulid';
import { MarkerPicker } from './marker-picker';

// Черновик одной секции. `position` ЗДЕСЬ НЕТ намеренно: порядок — это индекс в массиве, и он
// пересчитывается в 1..N ровно один раз, при сборке payload. Держать позицию в состоянии значило
// бы завести второй источник правды о порядке, который рано или поздно разойдётся с массивом.
//
// `sectionKey` минтится клиентом при добавлении строки и НИКОГДА не переминчивается: по нему
// сервер диффит секции, а на её id будущий факт расхода (Ф5б.2) и приёмка кроя (Ф5б.5) повесят
// настоящий FK. Строка обязана быть долговечной ДО того, как на неё что-то показало.
export type SectionDraft = { sectionKey: string; markerId: number; plies: string };

export function newSectionDraft(): SectionDraft {
  return { sectionKey: ulid(), markerId: 0, plies: '' };
}

export function sectionPlies(s: SectionDraft): number {
  const n = Number(s.plies);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

// Строки секций настила. Полностью УПРАВЛЯЕМЫЕ: собственного состояния не держат, каждое
// изменение уходит наверх целым массивом. Порядок меняется кнопками ↑↓, а не перетаскиванием —
// секций у настила единицы, а drag'n'drop здесь стоил бы библиотеки и клавиатурной доступности.
export function LaySectionRows({
  sections,
  onChange,
  mode,
  runMarkers,
  copySources,
  bomLineKey,
  colorwayId,
  onCopyMarker,
  copying,
  disabled,
}: {
  sections: SectionDraft[];
  onChange: (next: SectionDraft[]) => void;
  mode: common_ProductionLayMode;
  runMarkers: common_TechCardMarkerSummary[];
  copySources: common_TechCardMarkerSummary[];
  bomLineKey: string;
  colorwayId: number;
  onCopyMarker: (sourceMarkerId: number) => void;
  copying: boolean;
  disabled: boolean;
}) {
  const faceToFace = mode === 'PRODUCTION_LAY_MODE_FACE_TO_FACE';

  const patch = (i: number, next: Partial<SectionDraft>) =>
    onChange(sections.map((s, idx) => (idx === i ? { ...s, ...next } : s)));

  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const markerOf = (id: number) => runMarkers.find((m) => (m.id ?? 0) === id);

  return (
    <div className='flex flex-col gap-1'>
      <DataTable>
        <thead>
          <tr>
            <th>#</th>
            <th>раскладка</th>
            <th>слоёв</th>
            <th>длина секции</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {sections.map((s, i) => {
            const plies = sectionPlies(s);
            const marker = markerOf(s.markerId);
            const len = Number(marker?.usedLengthCm?.value);
            const sectionLen = Number.isFinite(len) && plies > 0 ? len * plies : null;
            // Лицом к лицу слои складываются ПАРАМИ, поэтому нечётное число слоёв в такой секции
            // физически неисполнимо — сервер отказывает в сохранении (`lay_mode_parity`), и поле
            // краснеет здесь же, а не после круга к серверу.
            const oddInFaceToFace = faceToFace && plies > 0 && plies % 2 !== 0;
            return (
              <tr key={s.sectionKey}>
                <td>{i + 1}</td>
                <td className='text-left'>
                  <MarkerPicker
                    value={s.markerId}
                    runMarkers={runMarkers}
                    bomLineKey={bomLineKey}
                    colorwayId={colorwayId}
                    copySources={copySources}
                    onChange={(markerId) => patch(i, { markerId })}
                    onCopy={onCopyMarker}
                    copying={copying}
                    disabled={disabled}
                  />
                </td>
                <td>
                  <Input
                    name={`plies-${s.sectionKey}`}
                    className='w-16 text-right'
                    inputMode='numeric'
                    aria-invalid={oddInFaceToFace || undefined}
                    aria-label={`слоёв в секции ${i + 1}`}
                    disabled={disabled}
                    value={s.plies}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      patch(i, { plies: e.target.value.replace(/[^0-9]/g, '') })
                    }
                  />
                  {oddInFaceToFace ? (
                    <Text size='micro' className='text-error'>
                      нечётно
                    </Text>
                  ) : null}
                </td>
                <td>{sectionLen == null ? <EmptyCell /> : `${sectionLen.toFixed(1)} см`}</td>
                <td>
                  <div className='flex items-center justify-end gap-1'>
                    <Button
                      type='button'
                      variant='secondary'
                      size='xs'
                      disabled={disabled || i === 0}
                      aria-label={`поднять секцию ${i + 1}`}
                      onClick={() => move(i, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      type='button'
                      variant='secondary'
                      size='xs'
                      disabled={disabled || i === sections.length - 1}
                      aria-label={`опустить секцию ${i + 1}`}
                      onClick={() => move(i, 1)}
                    >
                      ↓
                    </Button>
                    <Button
                      type='button'
                      variant='secondary'
                      size='xs'
                      disabled={disabled}
                      aria-label={`удалить секцию ${i + 1}`}
                      onClick={() => onChange(sections.filter((_, idx) => idx !== i))}
                    >
                      ✕
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>

      {sections.length === 0 ? (
        <Text size='small' variant='inactive'>
          у настила нет ни одной секции — добавьте хотя бы одну, иначе кроить нечем
        </Text>
      ) : null}

      <div>
        <Button
          type='button'
          variant='secondary'
          size='sm'
          disabled={disabled}
          onClick={() => onChange([...sections, newSectionDraft()])}
        >
          + секция
        </Button>
      </div>
    </div>
  );
}
