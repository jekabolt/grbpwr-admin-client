import { createServer } from 'vite';

process.env.VITE_MODEL_MANNEQUIN_POSE_RPC_V1 = '1';

const server = await createServer({
  cacheDir: 'node_modules/.cache/model-detail-durable-pose-v1-vite',
  optimizeDeps: {
    include: ['three/examples/jsm/controls/TransformControls.js'],
    esbuildOptions: { target: 'esnext' },
  },
  server: {
    hmr: false,
    host: '127.0.0.1',
    port: 4566,
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
