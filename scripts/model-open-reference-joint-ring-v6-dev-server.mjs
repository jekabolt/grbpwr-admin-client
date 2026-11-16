import { createServer } from 'vite';

const server = await createServer({
  cacheDir: 'node_modules/.cache/model-open-reference-joint-ring-v6-vite',
  optimizeDeps: {
    esbuildOptions: { target: 'esnext' },
  },
  server: {
    hmr: false,
    host: '127.0.0.1',
    port: 4553,
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
