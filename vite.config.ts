import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
// @ts-ignore - plain JS helper shared with the Vercel serverless function (api/translate.js)
import { translateFields } from './api/_openrouter.js';

/**
 * Dev-only: serves POST /api/translate locally (production uses the Vercel
 * function at api/translate.js). Registered as a pre-middleware so it runs
 * before the `/api` dev proxy below would forward the request to the backend.
 */
function translateApiPlugin(apiKey?: string, model?: string) {
  return {
    name: 'translate-api',
    apply: 'serve' as const,
    configureServer(server: { middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void } }) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method === 'POST' && req.url?.startsWith('/api/translate')) {
          const sendJson = (status: number, payload: unknown) => {
            res.statusCode = status;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(payload));
          };
          try {
            const chunks: Buffer[] = [];
            for await (const chunk of req) chunks.push(chunk as Buffer);
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
            const translations = await translateFields({
              source: body.source,
              targets: body.targets,
              constraints: body.constraints,
              apiKey,
              model,
            });
            sendJson(200, { translations });
          } catch (e: any) {
            sendJson(502, { error: e?.message || 'Translation failed' });
          }
          return;
        }
        next();
      });
    },
  };
}

/** Dev-only: proxies image fetches to bypass CORS when cropping files.grbpwr.com images */
function mediaProxyPlugin() {
  return {
    name: 'media-proxy',
    apply: 'serve' as const,
    configureServer(server: { middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void } }) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith('/media-proxy?')) {
          try {
            const url = new URL(req.url!, `http://${req.headers.host}`);
            const targetUrl = url.searchParams.get('url');
            if (!targetUrl?.startsWith('http')) {
              res.statusCode = 400;
              res.end('Invalid url param');
              return;
            }
            const resp = await fetch(targetUrl, { headers: { Accept: 'image/*' } });
            if (!resp.ok) throw new Error(`Upstream ${resp.status}`);
            res.statusCode = resp.status;
            resp.headers.forEach((v, k) => res.setHeader(k, v));
            const buf = await resp.arrayBuffer();
            res.end(Buffer.from(buf));
          } catch (e) {
            res.statusCode = 502;
            res.end('Proxy fetch failed');
          }
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      mediaProxyPlugin(),
      translateApiPlugin(env.OPENROUTER_API_KEY, env.OPENROUTER_MODEL),
      react({
        // Only treat .tsx/.jsx as component modules so constants and utils don't trigger Fast Refresh warnings
        include: /\.(tsx|jsx)$/,
      }),
    ],
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      alias: {
        '@': path.resolve(__dirname, './src'),
        components: path.resolve(__dirname, './src/components'),
        constants: path.resolve(__dirname, './src/constants'),
        context: path.resolve(__dirname, './src/context'),
        hooks: path.resolve(__dirname, './src/hooks'),
        lib: path.resolve(__dirname, './src/lib'),
        types: path.resolve(__dirname, './src/types'),
        ui: path.resolve(__dirname, './src/ui'),
        utils: path.resolve(__dirname, './src/utils'),
        styles: path.resolve(__dirname, './src/styles'),
        api: path.resolve(__dirname, './src/api'),
      },
    },
    server: {
      port: 4040,
      proxy: {
        '/api': {
          target: env.VITE_API_BASE_URL || 'http://localhost:3999',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      minify: 'esbuild',
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
          },
        },
      },
    },
  };
});
