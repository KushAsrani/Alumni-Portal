import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import vercel from '@astrojs/vercel/serverless';

export default defineConfig({
  integrations: [tailwind()],
  output: 'hybrid',
  server: {
    host: '0.0.0.0',  // Allow connections from Docker
    port: 4321,
  },
  adapter: vercel({
    webAnalytics: {
      enabled: true
    }
  })
});