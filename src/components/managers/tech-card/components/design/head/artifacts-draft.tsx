import type { GetDesignBandResponse, common_DesignBenchSlot } from 'api/proto-http/admin';
import { useMemo, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import { InertDoor, pictureUrl } from '../bench-slot';
import {
  analyseMint,
  benchMinimumMet,
  readBench,
  sheetMinimumMissing,
  type MintOrigin,
} from '../mint-dialog';
import { provenanceLabel, readProvenance } from '../provenance';
import { viewLabel } from '../views';
import { AnnotationStrip } from './annotation-strip';

/**
 * ЖИВОЙ ЧЕРНОВИК-ВЕРСТАК — `artifactsDraftHtml` прототипа (`proto.html:3954`), второй этаж
 * ARTIFACTS: минимум листа собран, версии ещё нет. На экране стоит СОСТАВ, который заморозит минт.
 *
 * ПОЧЕМУ ПОЛОСА УКАЗАНИЙ ЗДЕСЬ МЁРТВАЯ, ХОТЯ В ПРОТОТИПЕ ОНА ЖИВАЯ.
 *
 * Прототип обещает «arm a kind above, or just click for a pin — the first callout mints v1»:
 * у него указание и минт — один жест. В этой сборке жест физически не собирается, и причина
 * измеримая, а не вкусовая: выноска приколота к `media_id`, а плита ВЕРСТАКА не лежит ни в
 * `technicalMedia`, ни в `moodboardMedia` карточки — в собственные медиа её вносит САМ МИНТ
 * (`injectBenchPlatesAsTechnicalMedia`, внутри транзакции минта). До минта колоть не к чему.
 *
 * У этого есть ровно два честных написания: нарисовать полосу мёртвой с причиной или не рисовать
 * вовсе. Второе выбрасывает из словаря экрана саму мысль «на листе рисуют», а первое объясняет
 * порядок: сначала минт, потом рисование. Поэтому полоса стоит, занимает свою постоянную высоту
 * (её резерв — часть верстки листа и после v1 не сдвинет ни одной картинки) и несёт `data-inert`.
 *
 * МИНТ ЗДЕСЬ — ДВЕРЬ, А НЕ ДЕЙСТВИЕ. Согласия (посадка загруженных плит, смешанный состав) спрашивает
 * `MintDialog`, и он же пишет версию в одной транзакции с сохранением карточки. Этот орган только
 * называет состав и открывает диалог с происхождением `callout` — «версия рождается ОТ АКТА».
 */

const CANNOT_DRAW_YET =
  'callouts are drawn on the card’s own plates — the mint is what puts these pictures there; mint v1 first';

function plateAspect(slot: common_DesignBenchSlot): string {
  const media = slot.picture?.media?.media;
  const dim = media?.fullSize ?? media?.thumbnail;
  const w = dim?.width ?? 0;
  const h = dim?.height ?? 0;
  // КАДР В ПРОПОРЦИЯХ САМОГО СНИМКА. Доля кадра осмысленна только на своём соотношении сторон:
  // подогнав чужое, мы двигаем будущие маркеры по изделию, и ни один пиксель на экране в этом не
  // признается. Снимок без размеров получает нейтральную рамку и НЕ получает маркеров.
  return w > 0 && h > 0 ? `${w} / ${h}` : '4 / 5';
}

function PlateCell({ name, slot }: { name: string; slot: common_DesignBenchSlot }): JSX.Element {
  const url = pictureUrl(slot.picture);
  const note = provenanceLabel(readProvenance(slot.picture ?? {}));
  return (
    <div className='min-w-0'>
      <Text
        size='nano'
        variant='uppercase'
        tracking='label'
        component='span'
        className='block truncate'
      >
        {name}
      </Text>
      {/* borderColor — ВНЕШНЯЯ рамка коробки; hairline тут был бы внутренней линейкой между
          строками, то есть перепутанными двумя серыми (DESIGN.md, «The Two-Greys Rule»). */}
      <div
        className='mt-1 w-full border border-borderColor bg-bgSecondary'
        style={{ aspectRatio: plateAspect(slot) }}
      >
        {url ? (
          <img src={url} alt={name} loading='lazy' className='block h-full w-full' />
        ) : (
          <div className='flex h-full w-full items-center justify-center'>
            <Text size='nano' variant='label' component='span' className='uppercase'>
              picture {slot.pictureId ?? 0}
            </Text>
          </div>
        )}
      </div>
      <Text size='nano' variant='label' component='p' className='mt-1 truncate'>
        {note}
      </Text>
    </div>
  );
}

export function ArtifactsDraft({
  band,
  disabled,
  onMint,
}: {
  band: GetDesignBandResponse;
  disabled?: boolean;
  /** Открыть минт. Не задано — дверь нарисована мёртвой с причиной, а не убрана. */
  onMint?: (origin: MintOrigin) => void;
}): JSX.Element {
  const bench = useMemo(() => readBench(band), [band]);
  const analysis = useMemo(() => analyseMint(bench, []), [bench]);
  const ready = benchMinimumMet(bench);
  const missing = sheetMinimumMissing(bench);

  const silhouettes = analysis.plates.filter((p) => p.key.startsWith('view:'));
  const details = analysis.plates.filter((p) => !p.key.startsWith('view:'));

  const mintReason = disabled
    ? 'the card is released: its sheet is frozen'
    : !ready
      ? `${missing.map((v) => viewLabel(v)).join(' and ')} still stand empty on the bench`
      : !onMint
        ? 'the mint is not wired to this screen — it writes in the same transaction as the card’s Save'
        : null;

  return (
    <Section
      title='draft — no version yet'
      question='— the composition a mint would freeze; a version is born of an act, never of a file changing'
      action={
        mintReason ? (
          <InertDoor label='mint v1 ▸' reason={mintReason} />
        ) : (
          <Button type='button' variant='main' size='sm' onClick={() => onMint?.('callout')}>
            mint v1 ▸
          </Button>
        )
      }
    >
      <CalloutBox tone='note'>
        <Text size='micro' component='p'>
          <b>Nothing is frozen yet.</b> A version pins WHICH PICTURES are on the sheet, so a printed
          page can name one composition and be checked against it later. The callouts are not part
          of that freeze — paper always prints the ones the card holds now.
        </Text>
      </CalloutBox>

      {/* ПОЛОСА УКАЗАНИЙ СТОИТ И МОЛЧИТ. См. шапку файла: до минта плита верстака не лежит в
          медиа карточки, и колоть к ней нечего. Высота полосы постоянна, поэтому появление v1
          не сдвинет ни одной плиты вниз. */}
      <AnnotationStrip
        tool={null}
        onTool={() => {}}
        inert={CANNOT_DRAW_YET}
        emptyHint='the callout editor opens on the document’s own plates, after v1'
      />

      {silhouettes.length === 0 ? (
        <Text size='micro' variant='label' component='p'>
          no plate stands on the bench yet.
        </Text>
      ) : (
        <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-3'>
          {silhouettes.map((p) => (
            <PlateCell key={p.key} name={p.name} slot={p.slot} />
          ))}
        </div>
      )}

      {details.length > 0 && (
        <div>
          <GroupLabel action={<Pill tone='mut'>cited by name</Pill>}>details</GroupLabel>
          <div className='grid gap-2 sm:grid-cols-3 lg:grid-cols-4'>
            {details.map((p) => (
              <PlateCell key={p.key} name={p.name} slot={p.slot} />
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}
