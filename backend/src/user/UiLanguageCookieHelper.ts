import type { FastifyReply } from 'fastify';
import { singleton } from 'tsyringe';
import AppConfiguration from '../config/AppConfiguration.js';
import AbstractCookieHelper, { type CookieOptions } from '../webserver/utility/AbstractCookieHelper.js';

@singleton()
export default class UiLanguageCookieHelper extends AbstractCookieHelper {
  private static readonly COOKIE_NAME = 'apollo_ui_lang';
  private static readonly AUTO_VALUE = 'auto';

  private readonly MAX_AGE_SECONDS = 400 * 24 * 60 * 60;  // 400y

  constructor(appConfig: AppConfiguration) {
    super(appConfig);
  }

  setUiLanguageCookie(reply: FastifyReply, value: string | null): void {
    reply.setCookie(UiLanguageCookieHelper.COOKIE_NAME, value ?? UiLanguageCookieHelper.AUTO_VALUE, this.cookieOptions());
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: false,
      secure: super.useSecureCookieOption(),
      path: '/',
      maxAge: this.MAX_AGE_SECONDS,
      sameSite: 'lax',
    };
  }
}
