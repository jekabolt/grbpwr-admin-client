// esbuild `build` for browser probes, with Vite's `?url` / `?raw` asset queries stubbed.
//
// The app imports fonts the Vite way (`@/fonts/FeatureMono-Regular.ttf?url` in
// care-labels/text-outline.ts and assembly-print/paper-pdf.ts). Plain esbuild does not know the
// query and fails the whole bundle — every probe whose entry reaches those modules then fails
// before it runs a check. The probes never shape text or print paper, so an empty string is enough.
// A probe that DOES need the bytes (composition-label) keeps its own plugin.
//
// Use: `import { esbuild } from './probe-esbuild.mjs';` in place of
// `import { build as esbuild } from 'esbuild';` — same signature, the stub goes first.
import { build } from 'esbuild';

export const viteQueryStub = {
  name: 'vite-query-stub',
  setup(b) {
    b.onResolve({ filter: /\?(raw|url)$/ }, (args) => ({ path: args.path, namespace: 'vite-q' }));
    b.onLoad({ filter: /.*/, namespace: 'vite-q' }, () => ({
      contents: 'export default "";',
      loader: 'js',
    }));
  },
};

export function esbuild(options) {
  return build({ ...options, plugins: [viteQueryStub, ...(options.plugins ?? [])] });
}
