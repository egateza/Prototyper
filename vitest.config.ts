import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Tes memeriksa pesan berbahasa Indonesia; tanpa ini bahasa mengikuti OS mesin tes. Tes i18n mengatur sendiri.
    env: { PROTOTYPER_LANG: 'id' },
    testTimeout: 20_000,
    hookTimeout: 20_000,
    fileParallelism: false, // tes runtime memakai port asli
  },
});
