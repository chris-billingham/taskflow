import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'src/stores/**/*.ts',
        'src/hooks/**/*.ts',
        'src/components/**/*.tsx',
      ],
      exclude: ['src/test/**', 'src/**/*.d.ts'],
      // Ratchet thresholds set just under measured coverage — see api config.
      // Re-baselined for Vitest 5 (Sept 2026): its v8 coverage remaps by AST
      // and counts files no test loads, so branch/function figures are not
      // comparable with the Vitest 1 ones. Ratchet up from here, never down.
      thresholds: {
        statements: 13,
        branches: 12,
        functions: 12,
        lines: 13,
      },
    },
  },
});
