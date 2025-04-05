import { PrismaClient } from '@prisma/client';
import { ConfigFile, HttpClient } from '@spraxdev/node-commons';
import Crypto from 'node:crypto';
import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import FileStatCache from './cache/FileStatCache';
import FileTypeUtils from './FileTypeUtils';
import { ApolloConfig } from './global';
import ProcessManager from './process_manager/ProcessManager';

const IS_PRODUCTION = process.env.NODE_ENV?.toLowerCase() === 'production';

let processManager: ProcessManager;
let fileTypeUtils: FileTypeUtils;
let fileNameCollator: Intl.Collator;
let httpClient: HttpClient;
let prismaClient: PrismaClient | null;
let fileStatCache: FileStatCache;

const APP_ROOT = Path.resolve(Path.dirname(__dirname));
const WORKING_DIR_ROOT = determineDefaultWorkingRoot();
const APP_TMP_DIR = determineAppTmpDir();

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
        port: 8080,
        trustProxy: ['loopback'],
      },

      database: {
        postgres: {
          enabled: false,

          host: 'localhost',
          port: 5432,

          username: 'apollo',
          password: 'v3ryS3cret',
          database: 'apollo',

          ssl: true,
          poolSize: 4,
        },
      },

      mediaLibrary: {
        externalProviders: {
          myAnimeList: {
            clientId: '',
          },
          theMovieDb: {
            apiReadAccessToken: '',
          },
          theTvDb: {
            apiKey: '',
          },
        },
      },

      login: {
        thirdParty: {
          microsoft: {
            enabled: false,
            type: 'OAuth2',
            displayName: 'Microsoft',

            clientId: '',
            clientSecret: '',

            scopes: ['openid', 'profile'],
            requestBodyContentType: 'x-www-form-urlencoded',

            authorizeUrl: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
            tokenUrl: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',

            accountInfo: {
              url: 'https://graph.microsoft.com/oidc/userinfo',
              idField: ['sub'],
              nameField: ['name'],
            },
          },
          google: {
            enabled: false,
            type: 'OAuth2',
            displayName: 'Google',

            clientId: '',
            clientSecret: '',

            scopes: ['https://www.googleapis.com/auth/userinfo.profile'],
            requestBodyContentType: 'x-www-form-urlencoded',

            authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
            tokenUrl: 'https://oauth2.googleapis.com/token',

            accountInfo: {
              url: 'https://www.googleapis.com/userinfo/v2/me',
              idField: ['id'],
              nameField: ['name'],
            },
          },
          github: {
            enabled: false,
            type: 'OAuth2',
            displayName: 'GitHub',

            clientId: '',
            clientSecret: '',

            scopes: ['identify'],
            requestBodyContentType: 'json',

            authorizeUrl: 'https://github.com/login/oauth/authorize',
            tokenUrl: 'https://github.com/login/oauth/access_token',

            accountInfo: {
              url: 'https://api.github.com/user',
              idField: ['id'],
              nameField: ['login'],
            },
          },
          discord: {
            enabled: false,
            type: 'OAuth2',
            displayName: 'Discord',

            clientId: '',
            clientSecret: '',

            scopes: [],
            requestBodyContentType: 'x-www-form-urlencoded',

            authorizeUrl: 'https://discord.com/api/oauth2/authorize',
            tokenUrl: 'https://discord.com/api/oauth2/token',

            accountInfo: {
              url: 'https://discordapp.com/api/users/@me',
              idField: ['id'],
              nameField: ['username'],
            },
          },
        },
      },

      secrets: {
        session: (() => {
          console.log('Generating session secret...');
          return Crypto.randomBytes(32).toString('hex');
        }) as any as string,
      },
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
  return APP_TMP_DIR;
}

export function getUserStorageTmpRoot(): string {
  return Path.join(getAppTmpDir(), 'user-storage', Path.sep);
}

// TODO: Maybe introduce a admin setting to choose if potentially large temporary files,
//       that will be moved (on success) to the user storage should be written to to the same partition or to APP_TMP_DIR,
//       which might be on an faster SSD for example (but causes a more expensive copy/move operation to happen instead of a simpel and fast "rename")
//       I am honestly not sure what is universally better... Right now only the video edit prototype uses it and it is *expected* to succeed every time
//       (so writing it to the faster SSD and then copying it to the slower HDD is in theory always more expensive)
//       But maybe this additional cost is preferred for some users/setups - Apollo should not make too many assumptions about the setup and offer ways to reasonable support most setups
export function getUserStorageTmpRootOnSameFileSystem(): string {
  return Path.join(getUserStorageRoot(), '.tmp', Path.sep);
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
    fileNameCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'accent' });
  }

  return fileNameCollator;
}

export function getHttpClient(): HttpClient {
  if (httpClient == null) {
    const packageJson = getPackageJson();

    httpClient = new HttpClient(HttpClient.generateUserAgent(
      packageJson.name ?? 'Unknown-App-Name',
      packageJson.version ?? 'Unknown-App-Version',
    ));
  }

  return httpClient;
}

export function getPrismaClient(): PrismaClient | null {
  if (prismaClient === undefined) {
    prismaClient = null;

    const databaseConfig = getConfig().data.database.postgres;
    if (databaseConfig.enabled) {
      if ((process.env.DATABASE_URL?.trim().length ?? 0) <= 0) {
        const databaseUrl = new URL(`postgresql://${databaseConfig.host}:${databaseConfig.port}`);
        databaseUrl.username = databaseConfig.username;
        databaseUrl.password = databaseConfig.password;
        databaseUrl.pathname = databaseConfig.database;
        databaseUrl.searchParams.set('ssl', databaseConfig.ssl ? 'true' : 'false');
        databaseUrl.searchParams.set('connection_limit', databaseConfig.poolSize.toString());

        process.env.DATABASE_URL = databaseUrl.toString();
      } else {
        console.warn('DATABASE_URL environment variable already set. Ignoring database config from config.json');
      }

      prismaClient = new PrismaClient();
    }
  }

  return prismaClient;
}

export function getPrismaClientIfAlreadyInitialized(): PrismaClient | null {
  return prismaClient ?? null;
}

export function getFileStatCache(): FileStatCache {
  if (fileStatCache == null) {
    fileStatCache = new FileStatCache();
  }

  return fileStatCache;
}

function getPackageJson(): { name?: string, version?: string } {
  const packageJsonPath = Path.join(__dirname, '..', 'package.json');
  if (!Fs.existsSync(packageJsonPath)) {
    return {};
  }

  return JSON.parse(Fs.readFileSync(packageJsonPath, 'utf8'));
}

function determineDefaultWorkingRoot(): string {
  let workingRoot = process.env.APOLLO_WORKING_ROOT;

  if (workingRoot == null || workingRoot.length === 0) {
    workingRoot = Path.join(Os.homedir(), 'ApolloFiles', Path.sep);
    console.warn(`Environment variable 'APOLLO_WORKING_ROOT' not set. Using default: ${workingRoot}`);
  }

  workingRoot = Path.resolve(workingRoot) + Path.sep;

  Fs.mkdirSync(workingRoot, { recursive: true });

  return workingRoot;
}

function determineAppTmpDir(): string {
  let tmpDir = process.env.APOLLO_TMP_DIR;

  if (tmpDir == null || tmpDir.length === 0) {
    tmpDir = Path.join(getWorkingRoot(), 'tmp', 'app', Path.sep);
    console.log(`Using ${JSON.stringify(tmpDir)} as app tmp dir (APOLLO_TMP_DIR not set)`);
  } else {
    tmpDir = Path.join(tmpDir, 'apollo_tmp');
    tmpDir = Path.resolve(tmpDir) + Path.sep;
  }

  Fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}
