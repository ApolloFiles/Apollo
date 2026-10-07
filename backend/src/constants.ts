import { type AppInfo, getAppInfo as readAppInfo } from '@sprax/node-framework';
import Path from 'node:path';
import Url from 'node:url';
import SentrySdk from './utils/SentrySdk.js';

let appInfo: AppInfo | undefined;

const __dirname = Url.fileURLToPath(new URL('.', import.meta.url));

export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
export const APP_ROOT_DIR = Path.join(__dirname, '..');

export function getAppInfo(): Readonly<AppInfo> {
  appInfo ??= readAppInfo(new URL('../', import.meta.url), SentrySdk.logAndCaptureError);
  return appInfo;
}
