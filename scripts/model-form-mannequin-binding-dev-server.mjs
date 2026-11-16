import { createServer } from 'vite';

const server = await createServer({
  cacheDir: 'node_modules/.cache/model-form-mannequin-binding-vite',
  optimizeDeps: {
    include: ['three/examples/jsm/controls/TransformControls.js'],
    esbuildOptions: { target: 'esnext' },
  },
  server: {
    host: '127.0.0.1',
    port: 4423,
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
