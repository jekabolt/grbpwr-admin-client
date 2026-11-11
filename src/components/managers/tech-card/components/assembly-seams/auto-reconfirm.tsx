// AFTER AN IMPORT APPLY (T6, owner 09.11): the seams the re-upload stamped stale on UNCHANGED edges
// come back confirmed by themselves. Mounted once the apply saved the card (or had nothing to save:
// the same file again, the stamps of an earlier upload still standing). An apply that closed with
// the fusing sheets owed (T5: the card's save finishes the rebuild under its own chip) hands over the
// run its save started from: the job waits for that rebuild to end and stops on its failure; any
// other apply only waits out a rebuild in flight (it moves the fused pieces' source again). Then it
// reads the card, segments its DXF the way the step seams were anchored (useAssemblyGeometry), lets
// `autoReconfirmable` pick the rows and stores them in ONE seam write: `useSeamWrites().upsert`, the
// path the review's re-confirm took. UpsertTechCardSeams locks the card row and leaves its
// lock_version as it was, so the next card save meets no version conflict. Any failure (rebuild,
// read, geometry, write, timeout) ends quietly: the rows stay stale for the review, as before.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { adminService } from 'api/api';
import type { common_TechCard } from 'api/proto-http/admin';
import type { TechCardSeamWire } from 'lib/seams';

import { useAssemblyGeometry } from '../../techpack/use-assembly-geometry';
import {
  fusingRebuildGate,
  getFusingSheetGenerationState,
  subscribeFusingSheetGeneration,
} from '../nesting/fusing-sheets-stage';
import { autoReconfirmable } from './seam-actions';
import { hydrateSeams, readWire, useSeamsStore } from './seams-store';
import { useSeamWrites } from './use-seam-decisions';

const RELEASED = 'TECH_CARD_APPROVAL_STATE_RELEASED';
/** A rebuild or a geometry read that never settles must not keep the job alive. */
const GIVE_UP_MS = 3 * 60_000;

const staleSeams = (wire: readonly TechCardSeamWire[]) =>
  readWire(wire).rows.filter((row) => row.stale && row.kind !== 'surface');

/**
 * `onDone(kept)` fires once: the rows re-confirmed, 0 when nothing was (or could be) written.
 * `owedAfter`: the fusing run counter the apply's save started from, when it closed with fusing owed.
 */
export function SeamsReconfirmRunner({
  cardId,
  owedAfter,
  onDone,
}: {
  cardId: number;
  owedAfter?: number;
  onDone: (kept: number) => void;
}) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const ended = useRef(false);
  const finish = useCallback((kept: number) => {
    if (ended.current) return;
    ended.current = true;
    doneRef.current(kept);
  }, []);

  const subscribe = useCallback(
    (listener: () => void) => subscribeFusingSheetGeneration(cardId, listener),
    [cardId],
  );
  const readRebuild = useCallback(() => getFusingSheetGenerationState(cardId), [cardId]);
  const gate = fusingRebuildGate(
    useSyncExternalStore(subscribe, readRebuild, readRebuild),
    owedAfter,
  );
  const [card, setCard] = useState<common_TechCard | null>(null);

  useEffect(() => {
    const t = setTimeout(() => finish(0), GIVE_UP_MS);
    return () => clearTimeout(t);
  }, [finish]);

  useEffect(() => {
    if (card || gate === 'wait') return;
    if (gate === 'failed') return finish(0);
    let live = true;
    adminService
      .GetTechCard({ id: cardId, vatCountryCode: undefined })
      .then((res) => {
        if (!live) return;
        const read = res.techCard;
        const wire = (read?.seams ?? []) as TechCardSeamWire[];
        if (!read || read.techCard?.approvalState === RELEASED || staleSeams(wire).length === 0)
          return finish(0);
        // The store takes the read's stale stamps; the write then needs no read of its own.
        if (hydrateSeams(cardId, wire, read.lockVersion))
          useSeamsStore.setState({ serverAt: Date.now() });
        setCard(read);
      })
      .catch(() => {
        if (live) finish(0);
      });
    return () => {
      live = false;
    };
  }, [card, gate, cardId, finish]);

  return card ? <ReconfirmWrite card={card} cardId={cardId} finish={finish} /> : null;
}

function ReconfirmWrite({
  card,
  cardId,
  finish,
}: {
  card: common_TechCard;
  cardId: number;
  finish: (kept: number) => void;
}) {
  const geo = useAssemblyGeometry(card, true);
  const writes = useSeamWrites(cardId, false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current || geo.dep.status === 'pending') return;
    ran.current = true;
    if (geo.dep.status === 'error') return finish(0);
    const rows = autoReconfirmable(staleSeams((card.seams ?? []) as TechCardSeamWire[]), {
      pieces: [...geo.pieces.values()].map((piece) => piece.geom),
      grainDeg: geo.grainDeg,
      nameOf: (key) => key,
    });
    if (rows.length === 0) return finish(0);
    void writes.upsert(rows).then((ok) => {
      if (!ok) {
        // Refused: the rows stay stale as before, without a «refused» line the user did not cause.
        const errors = { ...useSeamsStore.getState().errors };
        for (const row of rows) delete errors[row.seamKey];
        useSeamsStore.setState({ errors });
      }
      finish(ok ? rows.length : 0);
    });
  }, [geo.dep.status, geo.pieces, geo.grainDeg, card, writes, finish]);

  return null;
}
