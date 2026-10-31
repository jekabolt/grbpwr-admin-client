/* global __APP_RELEASE__ */
// RECORD WHAT THE OWNER DID WITH A SEAM GUESS (AddTechCardSeamDecisions).
//
// The seam row keeps only the outcome: an accepted guess and an own pick both land as
// source=manual, a skip leaves no row. This log keeps the decision so the guess can be measured.
// Fire and forget, after the seam save succeeded: a refused or failed event never touches the seam.

import { adminService } from 'api/api';
import type {
  common_TechCardSeamDecisionAction,
  common_TechCardSeamGuessTier,
} from 'api/proto-http/admin';
import type { EdgeId } from 'lib/assembly-skeleton/types';

export type SeamDecisionAction = 'accept' | 'own' | 'skip' | 'refuse';
export type SeamGuessTier = 'confident' | 'guess' | 'none';

export type SeamDecision = {
  cardId: number;
  /** The step's operation number; 0 = the card-level seam review. */
  operationNumber: number;
  action: SeamDecisionAction;
  /** Key of the row written (accept / own) or rejected (refuse); none on skip. */
  seamKey?: string;
  /** Tier of the guess the UI showed. */
  tier?: SeamGuessTier;
  /** The proposal the UI showed. */
  shown?: { a: readonly EdgeId[]; b: readonly EdgeId[]; aLen?: number; bLen?: number } | null;
};

const ACTION: Record<SeamDecisionAction, common_TechCardSeamDecisionAction> = {
  accept: 'TECH_CARD_SEAM_DECISION_ACTION_ACCEPT',
  own: 'TECH_CARD_SEAM_DECISION_ACTION_OWN',
  skip: 'TECH_CARD_SEAM_DECISION_ACTION_SKIP',
  refuse: 'TECH_CARD_SEAM_DECISION_ACTION_REFUSE',
};

const TIER: Record<SeamGuessTier, common_TechCardSeamGuessTier> = {
  confident: 'TECH_CARD_SEAM_GUESS_TIER_CONFIDENT',
  guess: 'TECH_CARD_SEAM_GUESS_TIER_GUESS',
  none: 'TECH_CARD_SEAM_GUESS_TIER_NONE',
};

const SHOWN_MAX = 8 * 1024;

function side(edges: readonly EdgeId[]) {
  return edges.map((id) => {
    const at = id.lastIndexOf('#');
    return { piece: id.slice(0, at), k: Number(id.slice(at + 1)) };
  });
}

/** `{"a":[{piece,k}],"b":[…],"aLen","bLen"}`, or '' when nothing was shown or it does not fit. */
export function shownJson(shown: SeamDecision['shown']): string {
  if (!shown) return '';
  const json = JSON.stringify({
    a: side(shown.a),
    b: side(shown.b),
    aLen: shown.aLen,
    bLen: shown.bLen,
  });
  return json.length > SHOWN_MAX ? '' : json;
}

/** Send one decision; never throws, never awaited by the save path. */
export function recordSeamDecision(decision: SeamDecision): void {
  if (!decision.cardId) return;
  const seamKey = decision.action === 'skip' ? '' : decision.seamKey ?? '';
  if (decision.action !== 'skip' && !seamKey) return;
  adminService
    .AddTechCardSeamDecisions({
      techCardId: decision.cardId,
      decisions: [
        {
          operationNumber: decision.operationNumber,
          action: ACTION[decision.action],
          seamKey,
          tier: decision.tier ? TIER[decision.tier] : 'TECH_CARD_SEAM_GUESS_TIER_UNKNOWN',
          shown: shownJson(decision.shown),
          clientVersion: (__APP_RELEASE__ || '').slice(0, 40),
          id: undefined,
          createdBy: undefined,
          createdAt: undefined,
        },
      ],
    })
    .catch(() => undefined);
}
