// The card's block-name rules the gate must agree with, INJECTED.
//
// G9 names `deriveBlockSizes` and G10 `uniDuplicateConflicts`/`uniGradedConflicts`; they live in
// `components/managers/tech-card/components/nesting/block-code.ts`, and 08-CONTRACT §2 forbids
// `lib/** → components/**`. So the gate takes them as a dependency: the worker stage (or a probe)
// passes the real module (`import * as blockCode from 'components/.../block-code'` satisfies this
// type structurally). ORCHESTRATOR: once block-code.ts moves under lib/ (F6b touches it anyway),
// a default can be wired here and the parameter dropped.
//
// `isValidIdentity` is F5's `dictionary/grammar.ts`; until it lands the gate uses its local
// structural grammar (gate/grammar.ts), which cannot check dictionary membership.

export type CardBlockRules = {
  deriveBlockSizes(
    blockNames: Iterable<string>,
    isSizeToken: (token: string) => boolean,
  ): Map<string, string>;
  splitBlockSize(
    block: string,
    sizeTokens: { has(token: string): boolean },
  ): { identity: string; size: string; uni: boolean; uniBase: string };
  uniGroupsOf(
    entries: Iterable<{ raw: string; uniBase: string }>,
  ): Map<string, { uniBase: string; blocks: string[] }>;
  uniDuplicateConflicts(
    groups: ReadonlyMap<string, { uniBase: string; blocks: string[] }>,
  ): { kind: string; subject: string; blocks: string[] }[];
  uniGradedConflicts(
    groups: ReadonlyMap<string, { uniBase: string; blocks: string[] }>,
    gradedIdentities: ReadonlySet<string>,
  ): { kind: string; subject: string; blocks: string[] }[];
  bareToken(s: string): string;
  isValidIdentity?: (identity: string, sizeTokens: ReadonlySet<string>) => boolean;
};
