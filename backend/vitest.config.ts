import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.spec.ts'],
  },
  resolve: {
    alias: {
      src: path.resolve(__dirname, 'src'),
    },
  },
});
