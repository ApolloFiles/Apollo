import { type HttpRequest, type HttpResponse, UndiciHttpClient, UserAgentGenerator } from '@spraxdev/node-commons/http';
import { singleton } from 'tsyringe';
import { getAppInfo, IS_PRODUCTION } from '../constants.js';

/** @internal */
@singleton()
export default class SimpleHttpClient extends UndiciHttpClient {
  constructor() {
    super(SimpleHttpClient.getUserAgent());
  }

  protected request(request: HttpRequest): Promise<HttpResponse> {
    if (!IS_PRODUCTION) {
      console.debug(`[SimpleHttpClient] >>> ${request.options.method} ${request.url}`);
    }

    return super.request(request);
  }

  private static getUserAgent(): string {
    const appInfo = getAppInfo();
    return UserAgentGenerator.generate(appInfo.name, appInfo.version, true, appInfo.homepage);
  }
}
