import express from 'express';
import Path from 'node:path';
import { getAppResourcesDir, getConfig } from '../Constants';
import Utils from '../Utils';
import { AbstractTemplate } from './AbstractTemplate';

export interface LoginTemplateData {
  oAuthProvider: {
    id: string;
    displayName: string;
    href: string;
  }[];
}

export class LoginTemplate extends AbstractTemplate {
  constructor() {
    super(`apollo:login`, Path.join(getAppResourcesDir(), 'public', 'dynamic', 'login.ejs.html'));
  }

  render(req: express.Request, data: LoginTemplateData): string {
    return super.renderEjs({
      ...data,

      global: {
        templateId: this.templateId,
        req: { body: req.method === 'GET' ? req.query : req.body ?? {} },
        apolloConfig: getConfig().data,

        HELPERS: {
          escapeHtml: Utils.escapeHtml,
        },
      },
    });
  }
}
