import type { FastifyReply } from 'fastify';
import { singleton } from 'tsyringe';
import AppConfiguration from '../../config/AppConfiguration.js';
import AbstractCookieHelper, { type CookieOptions } from '../../webserver/utility/AbstractCookieHelper.js';


@singleton()
export default class SessionCookieHelper extends AbstractCookieHelper {
  private readonly SESSION_COOKIE_NAME = 'apollo_sid';
  private readonly ANONYMOUS_SESSION_COOKIE_NAME = 'apollo_a_sid';

  constructor(appConfig: AppConfiguration) {
    super(appConfig);
  }

  setSessionCookie(reply: FastifyReply, anonymousSession: boolean, sessionToken: string, sessionRemainingLifetimeInSeconds: number): void {
    const cookieSettings = this.getCookieSettings(anonymousSession, sessionRemainingLifetimeInSeconds);
    reply.setCookie(cookieSettings.name, sessionToken, cookieSettings.options);
  }

  unsetCookie(reply: FastifyReply, anonymousSession: boolean): void {
    const cookieSettings = this.getCookieSettings(anonymousSession, 0);
    reply.clearCookie(cookieSettings.name, cookieSettings.options);
  }

  extractSessionCookieValue(cookies: { [key: string]: string | undefined }, anonymousSession: boolean): string | undefined {
    return cookies[this.determineCookieName(anonymousSession, super.useSecureCookieOption())];
  }

  getCookieSettings(anonymousSession: boolean, maxAge: number): { name: string, options: CookieOptions } {
    const useSecureFlag = super.useSecureCookieOption();

    return {
      name: this.determineCookieName(anonymousSession, useSecureFlag),
      options: {
        httpOnly: true,
        secure: useSecureFlag,
        path: '/',
        maxAge,
        sameSite: 'lax',
      },
    };
  }

  private determineCookieName(anonymousSession: boolean, useSecureFlag: boolean): string {
    const cookiePrefix = useSecureFlag ? '__Host-Http-' : '';
    return `${cookiePrefix}${anonymousSession ? this.ANONYMOUS_SESSION_COOKIE_NAME : this.SESSION_COOKIE_NAME}`;
  }
}
