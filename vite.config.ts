import { defineConfig } from 'vite';
export default defineConfig({ server: { port: 5173, strictPort: true, proxy: {
  '/embeddedApi': { target: 'http://127.0.0.1:5101', rewrite: () => '/demo-rpg-rewards/us-central1/embeddedApi' },
} } });
