import type { GetDesignBandResponse, common_DesignPicture } from 'api/proto-http/admin';
import { CalloutBox } from 'ui/components/callout-box';
import Text from 'ui/components/text';
import { readBench, viewLabel } from './bench-slot';
import { batchHandle, shelfBatchOrdinals } from './handles';

/**
 * THE MIXED-INPUT WARNING — one question, asked of the silhouette sides only: can anything on this
 * card vouch that the plates standing there draw ONE garment?
 *
 * ONE UPLOAD GESTURE IS PRESUMED COHERENT. A batch is what one hand brought at one moment, and the
 * batch — not the file — is the carrier of that presumption. So four plates out of one upload say
 * nothing; plates out of two different uploads cannot be vouched for by anything the card knows,
 * and this bar says exactly that and no more.
 *
 * IT ASSERTS NOTHING ABOUT THE PICTURES THEMSELVES. Grey, not red: two uploads MAY draw one garment
 * perfectly well. The bar forbids nothing at all — it refuses to imply a coherence it cannot check,
 * and false green is the single outcome this organ exists to prevent.
 *
 * THE OTHER TWO BRANCHES OF THE PROTOTYPE ARE NOT BUILT, AND THAT IS DELIBERATE. Its red «FRONT is
 * behind» compares two GENERATION RUNS, and its second grey branch compares hand files against
 * generated ones. The generative machine is cut from this wave: `run_id` is 0 on every picture of
 * every live card, so both branches are unreachable by construction. Code that can never run is not
 * groundwork — it is a claim about behaviour nobody can check. They come back with generation, and
 * the rule they implement is written down in `03-PROTOTYPE-SPEC.md` §3.9 where it will be found.
 *
 * SILHOUETTES ONLY. A detail is a close-up of one part; two details from two uploads is normal
 * work, not a warning, and including them would light the bar on almost every real card.
 *
 * A PLATE THAT ALREADY CARRIES `mixed_input` keeps its own grey note in the slot's footer
 * (`mixedInputNote`), where it belongs: that flag is about how ONE picture was made, not about how
 * the composition was assembled, and folding the two into one sentence is how a caller drops half
 * of it.
 */

type MixedPlate = { view: string; picture: common_DesignPicture; batchId: number };

export function MixWarn({ band }: { band: GetDesignBandResponse }): JSX.Element | null {
  // The FLAT bench: this warning is a row of FLAT SLOTS and speaks about the sheet's composition.
  const bench = readBench(band, 'flat');
  const plates: MixedPlate[] = [];
  for (const { view, slot } of bench.sides) {
    const picture = slot?.picture;
    if (!picture) continue;
    const batchId = picture.batchId ?? 0;
    if (batchId > 0) plates.push({ view, picture, batchId });
  }
  if (plates.length < 2) return null;

  const batchIds = Array.from(new Set(plates.map((p) => p.batchId)));
  if (batchIds.length < 2) return null;

  // The batch is addressed by its position on THIS card's shelf — `upload 3` — because a database
  // id is not something a human can say out loud to the person standing next to them.
  const ordinals = shelfBatchOrdinals(band.batches ?? []);
  const where = plates
    .map((p) => `${viewLabel(p.view)} · ${batchHandle(ordinals.get(p.batchId))}`)
    .join(', ');

  return (
    <CalloutBox tone='note' className='bg-bgColor'>
      <div className='flex flex-wrap items-baseline gap-2'>
        <Text size='micro' component='span'>
          <b>provenance mixed</b>
        </Text>
        <Text size='micro' variant='label' component='span' className='min-w-0'>
          these plates come from different uploads — nothing on this card can vouch they draw one
          garment; coherence is on you.
        </Text>
      </div>
      <Text size='nano' variant='label' component='span' className='mt-1 block'>
        {where}
      </Text>
    </CalloutBox>
  );
}
