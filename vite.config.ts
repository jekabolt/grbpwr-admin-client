import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

/** Dev-only: proxies image fetches to bypass CORS when cropping files.grbpwr.com images */
function mediaProxyPlugin() {
  return {
    name: 'media-proxy',
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
            mui: ['@mui/material', '@mui/icons-material'],
          },
        },
      },
    },
  };
});
