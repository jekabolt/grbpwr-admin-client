// Node entry point for offline corpus tools; bundle the same TypeScript reader as the browser.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const entry = fileURLToPath(
  new URL('../../src/lib/pattern-import/pieces/printed-cut-ranges.ts', import.meta.url),
);
const { outputFiles } = await build({
  entryPoints: [entry],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
export const { readPrintedCuts, isPrintedCutPage } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64')
);
