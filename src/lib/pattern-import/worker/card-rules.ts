// The card's block-name rules for the gate (G9/G10), injected as `gate/rules.ts` asks: "the worker
// stage passes the real module". block-code.ts is pure (no imports) and is the one copy of the
// rule the card itself runs, so the gate agrees with the card by construction.
//
// This is the ONLY file under lib/pattern-import that reaches into components/ — sanctioned by
// gate/rules.ts until block-code.ts moves under lib/ (then import it from there and delete this).
import * as blockCode from 'components/managers/tech-card/components/nesting/block-code';
import type { CardBlockRules } from '../gate';

export const cardRules: CardBlockRules = blockCode;
