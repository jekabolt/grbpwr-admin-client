// Keeps the folds store on the card read (`TechCard.pieceFolds`), the way the seams hydrate: mounted
// once where the card's assembly order lives, so the step rows, the doll and the step pictures read
// the folds whether or not the fold sheet is ever opened. Draws nothing.

import type { common_TechCard } from 'api/proto-http/admin';
import type { TechCardPieceFoldWire } from 'lib/folds';
import { useEffect } from 'react';
import { useFoldLinksKeep } from './fold-links-keep';
import { resetFolds, useHydrateFolds } from './folds-store';

export function FoldsHydrate({ techCard }: { techCard: common_TechCard | undefined }) {
  useHydrateFolds(techCard?.id, techCard?.pieceFolds as TechCardPieceFoldWire[] | undefined);
  useFoldLinksKeep(techCard);
  useEffect(() => () => resetFolds(), []);
  return null;
}
