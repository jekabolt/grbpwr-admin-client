# Mannequin beta CI gate

The required mannequin gate is independent from the repository's probe baseline. It runs a
production-module unit allowlist followed by a bounded browser contour for:

- V9 live joint manipulation, camera ownership, arms at the sides, and last-valid anatomical
  rejection;
- last-valid canvas retention and single status ownership while measurements are typed;
- durable detail-pose load/save;
- new-model dirty-pose handoff, neutral no-op, and duplicate-safe pose-only retry;
- saved pose rendering on a Models card;
- model-measurement binding without API writes or serialized mesh data.

Run the same gate locally:

```bash
yarn test:mannequin:ci
```

Faster inspection commands:

```bash
yarn test:mannequin:unit
yarn test:mannequin:browser:list
yarn test:mannequin:browser
```

The allowlists live in `scripts/mannequin-ci-gate.mjs`. Keep them narrow: add only production beta
regressions, not research/legacy tests or exhaustive geometry corpus sweeps. The browser contour is
sequential by design because each suite owns a fixture server and Chromium process. Expensive
geometry sweeps remain available for focused development runs, while the required browser binding
case proves that production measurement edits reach rebuilt mannequin geometry.
