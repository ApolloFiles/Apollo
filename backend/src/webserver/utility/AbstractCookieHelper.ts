import AppConfiguration from '../../config/AppConfiguration.js';
import type FastifyCookiePlugin from '@fastify/cookie';

export type CookieOptions = Omit<FastifyCookiePlugin.SerializeOptions, 'encode'>;

export default abstract class AbstractCookieHelper {
  protected constructor(
    protected readonly appConfig: AppConfiguration,
  ) {
  }

  protected useSecureCookieOption(): boolean {
    return this.appConfig.config.baseUrl.toLowerCase().startsWith('https://');
  }
}
