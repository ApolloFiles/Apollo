import Fs from 'fs';
import Os from 'os';
import Path from 'path';

process.env.APOLLO_WORKING_ROOT = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apollo-tests'));

afterAll(async () => {
  if (process.env.APOLLO_WORKING_ROOT) {
    await Fs.promises.rm(process.env.APOLLO_WORKING_ROOT, {recursive: true, force: true});
  }
});
