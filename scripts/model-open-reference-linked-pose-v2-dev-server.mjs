import { createServer } from 'vite';

const server = await createServer({
  cacheDir: 'node_modules/.cache/model-open-reference-linked-pose-v2-vite',
  optimizeDeps: {
    esbuildOptions: { target: 'esnext' },
  },
  server: {
    // The browser gate runs in a shared worktree. Unrelated source writes must not remount the
    // mannequin fixture and reset a preview that the test has already built.
    hmr: false,
    host: '127.0.0.1',
    port: 4547,
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
