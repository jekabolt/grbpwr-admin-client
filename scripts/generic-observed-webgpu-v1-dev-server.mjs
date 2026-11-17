import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const sourceRoot = fileURLToPath(new URL('../src', import.meta.url));
const fixtureApi = fileURLToPath(
  new URL('./cloth/saved-observed-product-panel-v1.fixture-transport.ts', import.meta.url),
);
const route = '/__cloth-generic-observed-webgpu-v1';
const server = await createServer({
  root: repositoryRoot,
  appType: 'mpa',
  configFile: false,
  cacheDir: `node_modules/.cache/generic-observed-webgpu-v1-${process.pid}`,
  define: { __APP_RELEASE__: JSON.stringify('generic-observed-webgpu-v1') },
  optimizeDeps: {
    entries: ['scripts/cloth/generic-observed-webgpu-v1.tsx'],
    include: [
      'react',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'three',
      'cdt2d',
    ],
  },
  resolve: {
    alias: [
      { find: 'api/api', replacement: fixtureApi },
      ...Object.entries({
        '@': sourceRoot,
        api: `${sourceRoot}/api`,
        components: `${sourceRoot}/components`,
        constants: `${sourceRoot}/constants`,
        context: `${sourceRoot}/context`,
        hooks: `${sourceRoot}/hooks`,
        lib: `${sourceRoot}/lib`,
        styles: `${sourceRoot}/styles`,
        types: `${sourceRoot}/types`,
        ui: `${sourceRoot}/ui`,
        utils: `${sourceRoot}/utils`,
      }).map(([find, replacement]) => ({ find, replacement })),
    ],
  },
  plugins: [
    {
      name: 'generic-observed-numeric-route',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (new URL(request.url ?? '/', 'http://127.0.0.1').pathname !== route) return next();
          response.setHeader('Content-Type', 'text/html; charset=utf-8');
          response.setHeader('Cache-Control', 'no-store');
          response.end(
            '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Generic observed WebGPU numeric harness</title></head><body class="bg-pageBg text-textColor"><main class="mx-auto max-w-4xl bg-bgColor p-block"><div data-generic-observed-webgpu></div></main><script type="module" src="/scripts/cloth/generic-observed-webgpu-v1.tsx"></script></body></html>',
          );
        });
      },
    },
  ],
  server: { host: '127.0.0.1', port: 4596, strictPort: true, hmr: false },
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
