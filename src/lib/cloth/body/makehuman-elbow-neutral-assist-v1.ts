/**
 * Product-interaction policy for reaching the anatomical neutral elbow stop.
 *
 * The elbow's local-Z ring is nearly edge-on in the corrected straight side view: a normal 110 px
 * tangential sweep can report only 1–3 physical degrees. Acceleration is applied only while
 * straightening, so flexion placement retains its original one-degree precision.
 *
 * A wrist target moves on a camera-facing plane anchored at the drag-start wrist depth. That plane
 * can leave a small apparent bend even after the pointer visibly passes the straight-arm target.
 * The 18-degree terminal zone is reserved as a neutral detent for wrist IK; intentional low-angle
 * flexion remains available on the elbow ring.
 */
export const MAKEHUMAN_ELBOW_NEUTRAL_ASSIST_V1 = Object.freeze({
  ringNeutralDetentMaximumDeg: 18,
  ringStraighteningGain: 10,
  wristDragMaximumBendDeg: 18,
});
