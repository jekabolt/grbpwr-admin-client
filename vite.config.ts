import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      alias: {
        '@': path.resolve(__dirname, './src'),
        components: path.resolve(__dirname, './src/components'),
        constants: path.resolve(__dirname, './src/constants'),
        context: path.resolve(__dirname, './src/context'),
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
            mui: ['@mui/material', '@mui/icons-material', '@mui/x-data-grid'],
          },
        },
      },
    },
    define: {
      'process.env.VITE_API_BASE_URL': JSON.stringify(env.VITE_API_BASE_URL || ''),
    },
  };
});
