import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Run modules in import order even across a cycle between chunks.
        // Without it, a new shared chunk once led Rolldown to put its helpers
        // in an app chunk that React's chunk imported while that chunk imported
        // React back: "e is not a function" and a blank page in production
        // only. Costs about 7% in bundle size.
        strictExecutionOrder: true,
        // Libraries change far less often than the app, so keep them in their
        // own long-cached files rather than re-downloaded with every release.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
            { name: 'data', test: /node_modules[\\/](@tanstack|axios|socket\.io-client|engine\.io-client|zustand)[\\/]/ },
            { name: 'ui', test: /node_modules[\\/](@dnd-kit|lucide-react|date-fns)[\\/]/ },
          ],
        },
      },
    },
  },
  server: {
    port: 31779,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // The socket client defaults to same-origin, so dev needs the websocket
      // path proxied to the API just like production nginx/Traefik do.
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
