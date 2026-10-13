import Os from 'node:os';
import Path from 'node:path';

export const VITEST_ROOT_DIRECTORY = Path.join(Os.tmpdir(), 'apollo-vitest');
