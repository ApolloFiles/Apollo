/**
 * Runs in every worker before each test file (Vitest `setupFiles`).
 *
 * Its counterpart is `global-setup.ts`, which runs once per test run in the main process. Anything that has to exist
 * per worker – the DI container, module-level state, mocks – belongs here, because workers do not share memory.
 */
import '../../src/container-init.js';
import { container } from 'tsyringe';

beforeEach(() => {
  container.clearInstances();
});
