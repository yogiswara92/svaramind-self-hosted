import { defineConfig, loadEnv } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig(({ mode }) => {
  // Third arg '' loads every var in .env, not just VITE_-prefixed ones, so
  // FRONTEND_PORT is readable here even though it's not exposed to client code.
  const env = loadEnv(mode, process.cwd(), '');
  const port = Number(env.FRONTEND_PORT) || 57424;

  return {
    plugins: [svelte()],
    server: {
      port,
      strictPort: false
    },
    preview: {
      port
    },
    build: {
      outDir: 'dist',
      target: 'esnext'
    }
  };
});
