// reimport-sweep.mjs bundles `old-draft` = src/lib/pattern-import/fabrics/draft.ts before 7e4203260
// (git show); its shape for the type check is today's module.
declare module 'old-draft' {
  export { buildDraft } from 'lib/pattern-import/fabrics/draft';
}
