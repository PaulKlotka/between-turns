import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({ plugins: [tailwindcss()], server: { proxy: {
  '/embeddedApi': { target: 'http://127.0.0.1:5201', rewrite: () => '/demo-between-turns/us-central1/bingoEmbeddedApi' },
} } });
