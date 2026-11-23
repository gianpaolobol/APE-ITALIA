import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['lib/**/*.spec.ts', 'e2e/**/*.spec.ts'], environment: 'node' } });
