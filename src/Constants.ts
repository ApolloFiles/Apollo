import { ConfigFile } from '@spraxdev/node-commons';
import Fs from 'fs';
import Os from 'os';
import Path from 'path';
import FileTypeUtils from './FileTypeUtils';
import { ApolloConfig } from './global';
import ProcessManager from './process_manager/ProcessManager';

const IS_PRODUCTION = process.env.NODE_ENV?.toLowerCase() === 'production';

let processManager: ProcessManager;
let fileTypeUtils: FileTypeUtils;
let fileNameCollator: Intl.Collator;

const APP_ROOT = Path.resolve(Path.dirname(__dirname));
const WORKING_DIR_ROOT = determineDefaultWorkingRoot();

let cfg: ConfigFile<ApolloConfig>;

export function isProduction(): boolean {
  return IS_PRODUCTION;
}

export function getConfig(): ConfigFile<ApolloConfig> {
  if (cfg == null) {
    cfg = new ConfigFile<ApolloConfig>(Path.join(getAppConfigDir(), 'config.json'), {
      baseUrl: 'http://localhost:8080/',

      webserver: {
        host: '0.0.0.0',
        port: 8080
      },

      oauth: {
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
  return Path.join(getWorkingRoot(), 'config', Path.sep);
}

export function getAppResourcesDir(): string {
  return Path.join(APP_ROOT, 'resources', Path.sep);
}

export function getUserStorageRoot(): string {
  return Path.join(getWorkingRoot(), 'user-storage', Path.sep);
}

export function getAppTmpDir(): string {
  return Path.join(getWorkingRoot(), 'tmp', 'app', Path.sep);
}

export function getUserStorageTmpRoot(): string {
  return Path.join(getWorkingRoot(), 'tmp', 'user-storage', Path.sep);
}

export function getProcessManager(): ProcessManager {
  if (processManager == null) {
    processManager = new ProcessManager();
  }

  return processManager;
}

export function getProcessLogDir(): string {
  return Path.join(getWorkingRoot(), 'logs', 'child_processes', Path.sep);
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

function determineDefaultWorkingRoot(): string {
  let workingRoot = process.env.APOLLO_WORKING_ROOT;

  if (workingRoot == null || workingRoot.length === 0) {
    workingRoot = Path.join(Os.homedir(), 'ApolloFiles', Path.sep);
    console.warn(`Environment variable 'APOLLO_WORKING_ROOT' not set. Using default: ${workingRoot}`);
  }

  workingRoot = Path.resolve(workingRoot) + Path.sep;

  Fs.mkdirSync(workingRoot, {recursive: true});

  return workingRoot;
}
