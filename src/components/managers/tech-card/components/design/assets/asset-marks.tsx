import type {
  GetDesignBandResponse,
  common_DesignAssetPlacement,
  common_DesignPicture,
  common_TechCardAnnotation,
} from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useMemo, useState, type JSX } from 'react';
import {
  AnnotationSurface,
  type ShapePoint,
  type SurfaceCallout,
} from 'ui/components/annotation/surface';
import { AnnotationToolbar } from 'ui/components/annotation/toolbar';
import { annotationKindFromWire, annotationKindToWire } from 'ui/components/annotation/wire';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import { benchSides, unmarkedFlats } from '../render/model';
import { viewLabel } from '../views';
import { PatternPreview } from './pattern-preview';
import {
  ASSET_PATTERN,
  assetById,
  assetLabel,
  allAssets,
  pictureThumbUrl,
  placementsOnPicture,
  shelfOf,
} from './model';
import { useAssetWrites } from './use-assets';

/**
 * РАЗМЕТКА НА ФЛЭТАХ — ОДИН ОРГАН НА ТРИ ТРЕБОВАНИЯ ВЛАДЕЛЬЦА.
 *
 * V-6: «плейсхолдер в который мы можем добавить фото фурнитуры и разметиить на флетах где какая
 * фурнитура». V-7: «показать примером на флете на как и какого размера распологать этот паттерн».
 * V-8: «на флетах показать маркером какая часть какой тканью должна быть на фабрик рендере».
 *
 * ЭТО ОДНО ТРЕБОВАНИЕ В ТРЁХ ШЛЯПАХ: «вот эта вещь — вот здесь, на этом чертеже». Три отдельных
 * механизма были бы тремя геометриями, разъезжающимися на одной картинке, и тремя способами
 * поставить точку, из которых в промпт попадал бы один.
 *
 * РИСУЕТ ЭТО ОБЩИЙ ПРИМИТИВ УКАЗАНИЙ (`ui/components/annotation`), а не свой холст. В системе ОДНА
 * система указаний на четырёх экранах, и фигура, нарисованная здесь, обязана остаться той же дугой
 * везде, где её прочтут. Этот файл её ПРИМЕНЯЕТ и не правит.
 *
 * ЧТО ИМЕННО СТАВИТСЯ. Метка — это (ассет, кадр, геометрия, записка). Ассет выбирается ЗАРАНЕЕ,
 * чипом: без него клик по чертежу означал бы «поставить метку неизвестно чего», а метка без имени
 * ассета не отвечает ни на один из трёх вопросов выше. Пока ассет не выбран, поверхность заморожена
 * ПРОПОМ, а не `<fieldset disabled>`: замерено, что под задизейбленным предком `pointerdown`
 * стреляет — то есть постановка прошла бы сквозь такую «заморозку» в полный рост.
 *
 * ЗАПИСКА МЕТКИ — ЭТО И ЕСТЬ «КАКАЯ ЧАСТЬ». Она уезжает в промпт как `parts` соответствующей ткани
 * (см. `partsOfAsset`), поэтому второго поля «части изделия» рядом нет и быть не должно: два места
 * для одних слов разошлись бы в первый же день, и человек видел бы на флэте одно, а модель читала
 * другое.
 */

/** Кадр, на котором можно ставить метки: плита слота либо любой другой флэт карточки. */
type Markable = { picture: common_DesignPicture; label: string; inSlot: boolean };

function markableFlats(band: GetDesignBandResponse): Markable[] {
  const out: Markable[] = [];
  const seen = new Set<number>();
  for (const side of benchSides(band)) {
    const p = side.picture;
    if (!p?.id || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push({ picture: p, label: viewLabel(side.view), inSlot: true });
  }
  for (const p of unmarkedFlats(band)) {
    if (!p.id || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push({ picture: p, label: `flat ${p.id}`, inSlot: false });
  }
  return out;
}

const decimal = (n: number) => ({ value: String(Math.round(n * 1e4) / 1e4) });
const readDecimal = (d?: { value?: string }) => Number(d?.value ?? '0') || 0;

/** Метка полосы → вью-модель поверхности. Незнакомый вид становится пином — правило примитива. */
function toSurfaceCallout(
  p: common_DesignAssetPlacement,
  index: number,
  name: string,
): SurfaceCallout {
  const a = p.annotation;
  const points = (a?.points ?? []).map((pt) => ({ x: readDecimal(pt.x), y: readDecimal(pt.y) }));
  return {
    key: String(p.id),
    kind: annotationKindFromWire(a?.kind),
    points,
    label: { x: readDecimal(a?.labelX), y: readDecimal(a?.labelY) },
    number: index + 1,
    // ПЛАШКА НАЗЫВАЕТ АССЕТ, А НЕ ЗАПИСКУ. Вопрос, ради которого разметку завели, — «какая часть
    // какой тканью», и ответ на него это ИМЯ. Записка уточняет и читается в списке под кадром.
    text: [name, (p.note ?? '').trim()].filter(Boolean).join(' — '),
    hasText: true,
  };
}

export function AssetMarks({
  techCardId,
  band,
  disabled,
}: {
  techCardId: number;
  band: GetDesignBandResponse;
  disabled?: boolean;
}): JSX.Element {
  const writes = useAssetWrites(techCardId);
  const flats = useMemo(() => markableFlats(band), [band]);
  const assets = allAssets(band);
  const byId = useMemo(() => assetById(band), [band]);

  const [pictureId, setPictureId] = useState(0);
  const [armed, setArmed] = useState(0);
  const [tool, setTool] = useState<string | null>(null);
  const readOnly = !!disabled;

  // Кадр по умолчанию — первый доступный, но ВЫБОР ЧЕЛОВЕКА ПОБЕЖДАЕТ и не сбрасывается
  // перечитыванием полосы: иначе каждая запись метки возвращала бы человека на первый флэт.
  const active = flats.find((f) => f.picture.id === pictureId) ?? flats[0];
  const activeId = active?.picture.id ?? 0;

  const marks = useMemo(
    () => (activeId ? placementsOnPicture(band, activeId) : []),
    [band, activeId],
  );

  const callouts = useMemo(
    () => marks.map((p, i) => toSurfaceCallout(p, i, assetLabel(byId.get(p.assetId ?? 0)))),
    [marks, byId],
  );

  const armedAsset = byId.get(armed);
  const url = pictureThumbUrl(active?.picture);

  function write(points: ShapePoint[], kind: string, at: ShapePoint, placementId = 0, note = '') {
    if (!armed || !activeId) return;
    const annotation: common_TechCardAnnotation = {
      kind: annotationKindToWire(kind as any),
      points: points.map((p) => ({ x: decimal(p.x), y: decimal(p.y) })),
      // ТЕКСТ ГЕОМЕТРИИ ОСТАЁТСЯ ПУСТЫМ. Слова живут в `note` метки — ровно так же, как их
      // раскладывают замороженные выноски полосы (`DesignMoodCallout`): композированную строку
      // читает человек, а геометрия несёт только форму.
      text: '',
      labelX: decimal(at.x),
      labelY: decimal(at.y),
      color: undefined,
      pieceLineKey: '',
      dashed: false,
      filled: false,
      pieceLineKeys: [],
    };
    writes.setPlacement.mutate({ placementId, assetId: armed, pictureId: activeId, annotation, note });
  }

  if (!flats.length) {
    return (
      <div data-asset-marks>
        <GroupLabel>marks on the flats</GroupLabel>
        <Text size='micro' variant='inactive' component='p' className='normal-case'>
          There is no flat to mark yet. Generate one on FLAT, or bring a drawing in — a mark is a
          statement about a drawing, so it needs the drawing first.
        </Text>
      </div>
    );
  }

  return (
    <div data-asset-marks>
      <GroupLabel
        action={
          <Text size='micro' variant='label' component='span'>
            {marks.length} on this drawing
          </Text>
        }
      >
        marks on the flats
      </GroupLabel>

      <Text size='micro' variant='label' component='p' className='normal-case'>
        Which part is made of which cloth, and where each piece of hardware goes. A cloth's marks
        become the words the fabric render is told about it.
      </Text>

      {/* ─── 1. КАКОЙ ЧЕРТЁЖ ─────────────────────────────────────────────────────────────────── */}
      <ChipRow className='mt-2'>
        {flats.map((f) => (
          <Chip
            key={f.picture.id}
            nonForm
            selected={f.picture.id === activeId}
            pressed={f.picture.id === activeId}
            data-mark-flat={f.picture.id}
            onClick={() => setPictureId(f.picture.id ?? 0)}
          >
            {f.label}
            {placementsOnPicture(band, f.picture.id ?? 0).length > 0
              ? ` · ${placementsOnPicture(band, f.picture.id ?? 0).length}`
              : ''}
          </Chip>
        ))}
      </ChipRow>

      {/* ─── 2. ЧТО СТАВИМ ───────────────────────────────────────────────────────────────────── */}
      {assets.length === 0 ? (
        <Text size='micro' variant='inactive' component='p' className='mt-2 normal-case'>
          Put a cloth or a piece of hardware on a shelf above first — a mark names an asset, and
          there is none yet.
        </Text>
      ) : (
        <ChipRow className='mt-2'>
          <Text size='nano' variant='label' component='span' className='uppercase'>
            marking:
          </Text>
          {assets.map((a) => (
            <Chip
              key={a.id}
              nonForm
              selected={a.id === armed}
              pressed={a.id === armed}
              data-mark-asset={a.id}
              onClick={() => setArmed(a.id === armed ? 0 : (a.id ?? 0))}
            >
              {assetLabel(a)}
            </Chip>
          ))}
        </ChipRow>
      )}

      {/* ─── 3. ЧЕМ РИСУЕМ ───────────────────────────────────────────────────────────────────── */}
      {!readOnly && armed > 0 && (
        <AnnotationToolbar
          className='mt-2'
          tool={tool}
          onTool={setTool}
          // ТРИ ВИДА, А НЕ ВОСЕМЬ. Здесь отвечают на «где» и «какая область», а не чертят: пин
          // указывает на место, полигон обводит участок ткани, плашка подписывает узел. Мерки,
          // скобы и свободный след отвечают на вопросы, которых у этой разметки нет.
          kinds={['pin', 'polygon', 'label']}
        />
      )}

      {/* ─── 4. САМ ЧЕРТЁЖ ───────────────────────────────────────────────────────────────────── */}
      <div className='relative mt-2'>
        <AnnotationSurface
          src={url}
          alt={active?.label ?? 'flat'}
          heightPx={320}
          preferNaturalAspect
          halo
          hoverNotes
          callouts={callouts}
          // ЗАМОРОЗКА ПРОПОМ, А НЕ `fieldset`: см. шапку файла и замер в примитиве.
          frozen={readOnly || armed === 0}
          tool={tool}
          onToolDone={() => setTool(null)}
          onAdd={(kind, points) => {
            const at = points[points.length - 1] ?? { x: 0.5, y: 0.5 };
            write(points, kind, at);
          }}
          onEditPoints={(key, points) => {
            const p = marks.find((m) => String(m.id) === key);
            if (!p) return;
            write(
              points,
              annotationKindFromWire(p.annotation?.kind),
              {
                x: readDecimal(p.annotation?.labelX),
                y: readDecimal(p.annotation?.labelY),
              },
              p.id ?? 0,
              p.note ?? '',
            );
          }}
          onMoveLabel={(key, at) => {
            const p = marks.find((m) => String(m.id) === key);
            if (!p) return;
            write(
              (p.annotation?.points ?? []).map((pt) => ({
                x: readDecimal(pt.x),
                y: readDecimal(pt.y),
              })),
              annotationKindFromWire(p.annotation?.kind),
              at,
              p.id ?? 0,
              p.note ?? '',
            );
          }}
          onRemove={(key) => {
            const p = marks.find((m) => String(m.id) === key);
            if (p?.id) writes.deletePlacement.mutate(p.id);
          }}
        />

        {/* ПРЕДПРОСМОТР ПАТТЕРНА ЛЕЖИТ ПОВЕРХ ЧЕРТЕЖА, А НЕ РЯДОМ (V-7). Вопрос владельца —
            «КАКОГО РАЗМЕРА располагать», а размер это отношение раппорта к изделию: показанный
            рядом, он отвечал бы «вот такой квадратик», то есть ни на что. */}
        {armedAsset && shelfOf(armedAsset.kind ?? '') === ASSET_PATTERN && (
          <PatternPreview asset={armedAsset} />
        )}
      </div>

      {armed === 0 && assets.length > 0 && !readOnly && (
        <Text size='micro' variant='label' component='p' className='mt-1 normal-case'>
          Pick what you are marking above, then click the drawing. Nothing is placed until an asset
          is chosen — a mark with no name answers none of the questions this block exists for.
        </Text>
      )}

      {/* ─── 5. ЧТО НА ЭТОМ ЧЕРТЕЖЕ УЖЕ ОТМЕЧЕНО ─────────────────────────────────────────────── */}
      {marks.length > 0 && (
        <div className='mt-2'>
          {marks.map((p, i) => (
            <MarkRow
              key={p.id}
              index={i + 1}
              name={assetLabel(byId.get(p.assetId ?? 0))}
              note={p.note ?? ''}
              readOnly={readOnly}
              onNote={(note) => {
                writes.setPlacement.mutate({
                  placementId: p.id ?? 0,
                  assetId: p.assetId ?? 0,
                  pictureId: activeId,
                  annotation: p.annotation ?? {
                    kind: annotationKindToWire('pin'),
                    points: [],
                    text: '',
                    labelX: decimal(0.5),
                    labelY: decimal(0.5),
                    color: undefined,
                    pieceLineKey: '',
                    dashed: false,
                    filled: false,
                    pieceLineKeys: [],
                  },
                  note,
                });
              }}
              onRemove={() => p.id && writes.deletePlacement.mutate(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * ОДНА СТРОКА ЛЕГЕНДЫ. Записка коммитится ПО УХОДУ ФОКУСА, а не по клавише: это сетевой upsert, и
 * запрос на каждый символ это и деньги, и гонка, в которой побеждает самый медленный ответ.
 */
function MarkRow({
  index,
  name,
  note,
  readOnly,
  onNote,
  onRemove,
}: {
  index: number;
  name: string;
  note: string;
  readOnly: boolean;
  onNote: (note: string) => void;
  onRemove: () => void;
}): JSX.Element {
  const [draft, setDraft] = useState(note);
  const [seen, setSeen] = useState(note);
  // Синхронизация по ИЗМЕНЕНИЮ ПРИШЕДШЕГО, а не по расхождению с ним: иначе набранное откатывалось
  // бы к старому тексту раньше, чем сервер ответит, и навсегда, если ответ был отказом.
  if (seen !== note) {
    setSeen(note);
    setDraft(note);
  }
  return (
    <div className='flex items-center gap-2 border-b border-hairline py-1' data-mark-row={index}>
      <span
        aria-hidden='true'
        className='flex size-[16px] shrink-0 items-center justify-center bg-textColor'
      >
        <Text size='nano' variant='selected' component='span'>
          {index}
        </Text>
      </span>
      <Text size='micro' component='span' className='w-[140px] shrink-0 truncate uppercase'>
        {name}
      </Text>
      <div className='min-w-0 flex-1'>
        <Input
          name={`mark-note-${index}`}
          data-mark-note={index}
          value={draft}
          disabled={readOnly}
          maxLength={500}
          placeholder='which part — body, collar, left front…'
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== note) onNote(draft);
          }}
        />
      </div>
      {!readOnly && (
        <Button variant='secondary' size='xs' onClick={onRemove} title='take this mark off'>
          ✕
        </Button>
      )}
    </div>
  );
}
