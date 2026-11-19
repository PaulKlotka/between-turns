import { defineConfig } from 'vite';
export default defineConfig({server:{host:'127.0.0.1',port:5183,proxy:{'/embeddedApi':{target:'http://127.0.0.1:5201',rewrite:()=>`/demo-between-turns/us-central1/pushYourLuckApi`}}}});
