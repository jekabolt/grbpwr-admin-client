import { createServer } from 'vite';

const server = await createServer({
  cacheDir: 'node_modules/.cache/model-form-personalized-preview-vite',
  optimizeDeps: {
    include: ['three/examples/jsm/controls/TransformControls.js'],
    esbuildOptions: { target: 'esnext' },
  },
  server: {
    // This gate runs in a shared worktree where unrelated agents may write other source files.
    // A hot/full reload would remount the form and impersonate an application invalidation, so the
    // dedicated browser-test server deliberately serves one immutable module graph per run.
    hmr: false,
    host: '127.0.0.1',
    port: 4573,
    strictPort: true,
  },
});

await server.listen();

let closing = false;
const close = async () => {
  if (closing) return;
  closing = true;
  await server.close();
};

process.once('SIGINT', () => void close());
process.once('SIGTERM', () => void close());
