import Os from 'node:os';
import Path from 'node:path';
import { defineConfig } from 'vitest/config';
import { ProjectConfig } from 'vitest/node';
import { ACCEPTANCE_ENV } from './tests/acceptance/AcceptanceTestEnvironment.js';

const defaultProjectConfig: ProjectConfig = {
  environment: 'node',
  clearMocks: true,
  restoreMocks: true,
  globals: true,

  setupFiles: ['reflect-metadata'],
  server: { deps: { inline: ['@sprax/node-framework'] } },
  sequence: { shuffle: true },
  env: {
    // Unit tests must not touch the file system through Apollo's directories, so this one is never created
    APOLLO_DATA_DIRECTORY: Path.join(Os.tmpdir(), 'apollo-unit-tests-unused'),
    APOLLO_TMP_DIRECTORY: '',
    APOLLO_CACHE_DIRECTORY: '',
  },
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
          setupFiles: ['./tests/acceptance/worker-setup.ts'],
          globalSetup: ['./tests/acceptance/global-setup.ts'],
          testTimeout: 8_000,
          env: ACCEPTANCE_ENV,
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
