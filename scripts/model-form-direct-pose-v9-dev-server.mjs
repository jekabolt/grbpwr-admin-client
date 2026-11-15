import { createServer } from 'vite';

const server = await createServer({
  cacheDir: 'node_modules/.cache/model-form-direct-pose-v9-vite',
  optimizeDeps: {
    include: ['three/examples/jsm/controls/TransformControls.js'],
    esbuildOptions: { target: 'esnext' },
  },
  server: {
    hmr: false,
    host: '127.0.0.1',
    port: 4564,
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
