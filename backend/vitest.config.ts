import { defineConfig } from 'vitest/config';
import { ProjectConfig } from 'vitest/node';

const defaultProjectConfig: ProjectConfig = {
  environment: 'node',
  clearMocks: true,
  restoreMocks: true,
  globals: true,

  setupFiles: ['reflect-metadata'],
};

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          ...defaultProjectConfig,
          dir: './tests/unit/',
          name: 'unit',
        },
      },
      {
        test: {
          ...defaultProjectConfig,
          dir: './tests/acceptance/',
          name: 'acceptance',
          setupFiles: ['./tests/acceptance.setup.ts'],
          testTimeout: 8_000,
        },
      },
    ],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage/',

      include: [
        'src/**/*.ts',
      ],
      exclude: [
        './src/main.ts',
        './src/container-init.ts',

        './src/database/DatabaseClient.ts',
      ],
    },
  },
});
