import { defineConfig } from 'vite';
export default defineConfig({server:{host:'127.0.0.1',port:5183,proxy:{'/embeddedApi':{target:'http://127.0.0.1:5301',rewrite:p=>`/demo-push-your-luck/us-central1${p}`}}}});
