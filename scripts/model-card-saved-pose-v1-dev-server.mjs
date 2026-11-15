import { createServer } from 'vite';

process.env.VITE_MODEL_MANNEQUIN_POSE_RPC_V1 = '1';

const server = await createServer({
  cacheDir: 'node_modules/.cache/model-card-saved-pose-v1-vite',
  optimizeDeps: { esbuildOptions: { target: 'esnext' } },
  server: { hmr: false, host: '127.0.0.1', port: 4551, strictPort: true },
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
