import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';

process.env.APOLLO_WORKING_ROOT = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apollo-tests-'));
process.env.APOLLO_TMP_DIR = Path.join(process.env.APOLLO_WORKING_ROOT, 'tmp', 'app');

afterAll(async () => {
  if (process.env.APOLLO_WORKING_ROOT) {
    await Fs.promises.rm(process.env.APOLLO_WORKING_ROOT, { recursive: true, force: true });
  }
});
