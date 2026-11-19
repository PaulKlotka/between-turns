import { defineConfig } from 'vite';
export default defineConfig({ server: { port: 5173, strictPort: true, proxy: {
  '/embeddedApi': { target: 'http://127.0.0.1:5201', rewrite: () => '/demo-between-turns/us-central1/rewardsEmbeddedApi' },
} } });
