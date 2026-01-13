import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isProduction = mode === 'production';
  const basePath = isProduction ? '/grbpwr-admin-client' : '/';

  return {
    base: basePath,
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        // Support baseUrl: "src" from tsconfig - allows imports like "components/..."
        components: path.resolve(__dirname, './src/components'),
        constants: path.resolve(__dirname, './src/constants'),
        context: path.resolve(__dirname, './src/context'),
        lib: path.resolve(__dirname, './src/lib'),
        ui: path.resolve(__dirname, './src/ui'),
        styles: path.resolve(__dirname, './src/styles'),
        types: path.resolve(__dirname, './src/types'),
        api: path.resolve(__dirname, './src/api'),
        // Add explicit alias for api/proto-http
        'api/proto-http': path.resolve(__dirname, './src/api/proto-http'),
      },
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    },
    server: {
      port: 4040,
      proxy: {
        '/api': {
          target:
            env.VITE_API_BASE_URL ||
            env.REACT_APP_API_BASE_URL ||
            env.VITE_SERVER_URL ||
            env.REACT_APP_SERVER_URL ||
            'http://localhost:3999',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
            mui: ['@mui/material', '@mui/icons-material'],
          },
        },
      },
    },
    css: {
      modules: {
        localsConvention: 'camelCase',
      },
    },
  };
});
