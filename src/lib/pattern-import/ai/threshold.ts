// AUTO-ACCEPT THRESHOLD (08-CONTRACT §6) — the single place the namer reads T from.
//
// Calibrated by `yarn patimport:ai` §K on the K0 truth corpus (corpus/truth.json) with FAKE model
// answers derived from truth with injected errors (no network): 200 runs × error rates 10/25/40 %
// (half of the wrong answers confidently wrong, 0.80–0.97) × four text/card scenarios.
//
// Result (09.10): with the combiner's gates (text must back the base code; every modifier must be
// backed — side by text, hand by a mirrored twin, part number by its family's 1..k numbering; unique;
// G11 + dictionary; no conflict; no bare-name collision) precision on auto-accepted rows is ≥ 0.996
// in EVERY scenario at every T in 0.30…0.99, so the smallest T reaching 0.98 is the bottom of the
// sweep: T buys recall, not precision, under this error model. Recall at 0.30 vs 0.85: 0.23 vs 0.10
// (realistic text), 0.57 vs 0.27 (every label read), 0 vs 0 (no text — the model alone is never
// auto-accepted).
//
// The threshold IN USE stays at the contract's initial 0.85 until the sweep is re-run on REAL model
// answers: the fake model's confidence carries no information about its modifier errors, which is
// exactly what a real model's confidence might do differently. Lowering T is then a one-line change
// here, justified by the same probe on real answers.
import { PATIMPORT } from '../types';

export const AI_AUTO_ACCEPT_FLOOR = PATIMPORT.aiAutoAcceptInitial;

/** Smallest swept T with precision ≥ 0.98 in the worst calibration scenario (probe §K, 09.10). */
export const AI_AUTO_ACCEPT_CALIBRATED = 0.3;

export const AI_AUTO_ACCEPT_T = Math.max(AI_AUTO_ACCEPT_FLOOR, AI_AUTO_ACCEPT_CALIBRATED);

export const AI_PRECISION_TARGET = 0.98;
