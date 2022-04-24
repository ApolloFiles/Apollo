import { ConfigFile } from '@spraxdev/node-commons';
import Fs from 'fs';
import Path from 'path';
import FileTypeUtils from './FileTypeUtils';
import { ApolloConfig } from './global';

const IS_PRODUCTION = process.env.NODE_ENV?.toLowerCase() === 'production';

let fileTypeUtils: FileTypeUtils;
let fileNameCollator: Intl.Collator;

const APP_ROOT = Path.resolve(__dirname, '../');
const WORKING_DIR_ROOT = Path.resolve('/home/christian/Downloads/.Apollo-Backend/');

if (!Fs.existsSync(WORKING_DIR_ROOT)) {
  Fs.mkdirSync(WORKING_DIR_ROOT);
}

let cfg: ConfigFile<ApolloConfig>;

export function isProduction(): boolean {
  return IS_PRODUCTION;
}

export function getConfig(): ConfigFile<ApolloConfig> {
  if (cfg == null) {
    cfg = new ConfigFile<ApolloConfig>(Path.join(getAppConfigDir(), 'config.json'), {
      oauth: {
        google: {
          clientId: '',
          clientSecret: ''
        },
        github: {
          clientId: '',
          clientSecret: ''
        },
        microsoft: {
          clientId: '',
          clientSecret: ''
        }
      }
    });
    cfg.saveIfChanged();
  }

  return cfg;
}

export function getWorkingRoot(): string {
  return WORKING_DIR_ROOT;
}

export function getAppConfigDir(): string {
  return Path.join(getWorkingRoot(), 'config');
}

export function getAppResourcesDir(): string {
  return Path.join(APP_ROOT, 'resources');
}

export function getUserStorageRoot(): string {
  return Path.join(getWorkingRoot(), 'user-storage');
}

export function getAppTmpDir(): string {
  return Path.join(getWorkingRoot(), 'tmp', 'app');
}

export function getUserStorageTmpRoot(): string {
  return Path.join(getWorkingRoot(), 'tmp', 'user-storage');
}

export function getFileTypeUtils(): FileTypeUtils {
  if (fileTypeUtils == null) {
    fileTypeUtils = new FileTypeUtils();
  }

  return fileTypeUtils;
}

export function getFileNameCollator(): Intl.Collator {
  if (fileNameCollator == null) {
    fileNameCollator = new Intl.Collator('en', {numeric: true, sensitivity: 'accent'});
  }

  return fileNameCollator;
}
