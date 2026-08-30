import type { GetDesignBandResponse, common_DesignSheetPlate } from 'api/proto-http/admin';
import { CalloutBox } from 'ui/components/callout-box';
import Text from 'ui/components/text';
import {
  SHEET_MIN_VIEWS,
  isSilhouetteView,
  liveLayerRev,
  readBench,
  viewLabel,
} from './bench-slot';
import { plateStaleReason, readProvenance } from './provenance';

/**
 * THE SHEET BAR — what would go into the next sheet, and what the last one still says.
 *
 * A SHEET IS NOT A CEREMONY. There is no «accept» button anywhere: a version is minted as a
 * by-product of an act — the first callout, a print, a release — and this bar's whole job is to say
 * which of the four states the card is in BEFORE that act happens, so nobody discovers at print
 * time that the composition was two plates short.
 *
 * IT EATS NO RPC. Every line below is derived from the one band read — the bench against
 * `latest_version.plates`. Storing «has the bench moved» would be the lie of two sources: the
 * moment it is stored it can disagree with the plates it claims to summarise.
 *
 * THE DIFF IS COMPUTED OVER MEDIA IDS, not picture ids, and that is the only key the two sides
 * share: a frozen plate carries its `media`, a bench slot carries its `picture`. It is also the
 * more honest of the two — a version froze BYTES, and that is what «the bench has moved on» is
 * about.
 */

type DiffRow = { name: string; from: number; to: number };

function plateMediaId(plate: common_DesignSheetPlate | undefined): number {
  return plate?.media?.id ?? 0;
}

/**
 * ONE source for «what changed», and it covers SIDES AND DETAILS both. A diff blind to details was
 * a real defect: a card whose only change is a detail plate reported «matches the bench» and minted
 * a version nobody meant to mint.
 */
export function benchDiffRows(band: GetDesignBandResponse): DiffRow[] | null {
  const version = band.latestVersion;
  if (!version) return null;
  const plates = version.plates ?? [];
  const bench = readBench(band);
  const rows: DiffRow[] = [];

  for (const { view, slot } of bench.sides) {
    const plate = plates.find((p) => (p.viewKey ?? '').trim().toLowerCase() === view);
    rows.push({
      name: viewLabel(view),
      from: plateMediaId(plate),
      to: slot?.picture?.media?.id ?? 0,
    });
  }

  const detailPlates = plates.filter((p) => !isSilhouetteView(p.viewKey));
  const seen = new Set<number>();
  for (const slot of bench.details) {
    const plate = detailPlates.find((p) => p.slotId && p.slotId === slot.id);
    if (plate?.slotId) seen.add(plate.slotId);
    rows.push({
      name: (slot.detailName ?? '').trim() || 'detail',
      from: plateMediaId(plate),
      to: slot.picture?.media?.id ?? 0,
    });
  }
  // A detail the version cites and the bench no longer has. The version SURVIVES the slot's death,
  // which is why the plate carries a COPY of the name rather than a lookup.
  for (const plate of detailPlates) {
    if (plate.slotId && seen.has(plate.slotId)) continue;
    if (!plateMediaId(plate)) continue;
    rows.push({
      name: (plate.detailName ?? '').trim() || 'detail',
      from: plateMediaId(plate),
      to: 0,
    });
  }
  return rows;
}

export function benchDiff(band: GetDesignBandResponse): string[] | null {
  const rows = benchDiffRows(band);
  if (!rows) return null;
  const changed = rows.filter((r) => r.from !== r.to).map((r) => r.name);
  return changed.length ? changed : null;
}

/**
 * The frozen plates of the latest version that no longer match what is behind them.
 *
 * Two causes and both are read off the plate's own frozen facts against the CURRENT ones: the edit
 * layer advanced (someone saved newer strokes over the drawing it was flattened from), or the bytes
 * were replaced. A missing live revision or an empty hash on either side is NOT evidence — every
 * media older than 0336 has no hash at all, and reading «I have no hash» as «the bytes changed»
 * would light a stale badge on most of the existing library at once.
 */
function stalePlates(band: GetDesignBandResponse): { name: string; reason: string }[] {
  const out: { name: string; reason: string }[] = [];
  for (const plate of band.latestVersion?.plates ?? []) {
    const provenance = readProvenance(plate);
    const reason = plateStaleReason(provenance, {
      layerRev: liveLayerRev(band.layers, plate.media?.id),
      contentHash: plate.media?.contentHash,
    });
    if (!reason) continue;
    const name = isSilhouetteView(plate.viewKey)
      ? viewLabel(plate.viewKey)
      : (plate.detailName ?? '').trim() || 'detail';
    out.push({
      name,
      reason:
        reason === 'layer_advanced'
          ? 'the edit layer has moved on since it was minted'
          : 'the file behind it has been replaced',
    });
  }
  return out;
}

export function SheetBar({ band }: { band: GetDesignBandResponse }): JSX.Element {
  const bench = readBench(band);
  const rev = band.latestVersion?.versionNumber ?? 0;
  const stale = stalePlates(band);

  const missing = bench.sides
    .filter(({ view, slot }) => SHEET_MIN_VIEWS.includes(view) && !slot?.pictureId)
    .map(({ view }) => viewLabel(view));

  const staleLine = stale.length ? (
    <Text size='micro' component='span' className='mt-1 block text-warning'>
      {stale.length === 1
        ? `${stale[0].name.toUpperCase()} has gone stale — ${stale[0].reason}`
        : `${stale.length} plates have gone stale: ${stale
            .map((s) => `${s.name.toUpperCase()} (${s.reason})`)
            .join(', ')}`}
    </Text>
  ) : null;

  if (rev === 0) {
    if (missing.length) {
      return (
        <CalloutBox tone='note' className='bg-bgColor'>
          <div className='flex flex-wrap items-baseline gap-2'>
            <Text size='micro' component='span'>
              <b>SHEET — not issued yet</b>
            </Text>
            <Text size='micro' variant='label' component='span' className='min-w-0'>
              the sheet is the accepted composition of the slots below · {missing.join(' and ')}{' '}
              required
            </Text>
          </div>
          {staleLine}
        </CalloutBox>
      );
    }
    return (
      <CalloutBox tone='note' className='bg-bgColor'>
        <div className='flex flex-wrap items-baseline gap-2'>
          <Text size='micro' component='span'>
            <b>SHEET — not issued yet</b>
          </Text>
          <Text size='micro' variant='label' component='span'>
            the first callout, print or release will mint v1
          </Text>
        </div>
        {staleLine}
      </CalloutBox>
    );
  }

  const diff = benchDiff(band);
  if (!diff) {
    return (
      <CalloutBox tone='note' className='bg-bgColor'>
        <div className='flex flex-wrap items-baseline gap-2'>
          <Text size='micro' component='span'>
            <b>SHEET v{rev}</b>
          </Text>
          <Text size='micro' variant='label' component='span'>
            matches the bench
          </Text>
        </div>
        {staleLine}
      </CalloutBox>
    );
  }

  return (
    <CalloutBox tone='warning'>
      <div className='flex flex-wrap items-baseline gap-2'>
        <Text size='micro' component='span'>
          <b>SHEET v{rev}</b>
        </Text>
        <Text size='micro' component='span' className='min-w-0'>
          the bench has moved on: <b>{diff.join(', ').toUpperCase()}</b> · print and cut pieces stay
          on v{rev} until a new one is issued
        </Text>
      </div>
      {staleLine}
    </CalloutBox>
  );
}
