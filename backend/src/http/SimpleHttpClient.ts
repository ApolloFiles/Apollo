import { UndiciHttpClient, UserAgentGenerator } from '@spraxdev/node-commons/http';
import { singleton } from 'tsyringe';
import { getAppInfo } from '../constants.js';

/** @internal */
@singleton()
export default class SimpleHttpClient extends UndiciHttpClient {
  constructor() {
    super(SimpleHttpClient.getUserAgent());
  }

  private static getUserAgent(): string {
    const appInfo = getAppInfo();
    return UserAgentGenerator.generate(appInfo.name, appInfo.version, true, appInfo.homepage);
  }
}
