import { createServer } from 'vite';

const server = await createServer({
  cacheDir: 'node_modules/.cache/model-open-reference-joint-editor-v5-vite',
  optimizeDeps: {
    esbuildOptions: { target: 'esnext' },
  },
  server: {
    hmr: false,
    host: '127.0.0.1',
    port: 4552,
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
