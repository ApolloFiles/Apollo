import express from 'express';
import Path from 'node:path';
import { getAppResourcesDir, getConfig } from '../Constants';
import Utils from '../Utils';
import { AbstractTemplate } from './AbstractTemplate';

export class SimpleTemplate extends AbstractTemplate {
  constructor(templateIdSuffix: string, relativeTemplateFilePath: string) {
    super(`apollo:base:${templateIdSuffix}`, Path.join(getAppResourcesDir(), 'public', 'dynamic', relativeTemplateFilePath));
  }

  render(req: express.Request, data: object = {}): string {
    return super.renderEjs({
      ...data,

      global: {
        templateId: this.templateId,
        req: { body: req.method === 'GET' ? req.query : req.body ?? {} },
        apolloConfig: getConfig().data,
        HELPERS: {
          escapeHtml: Utils.escapeHtml
        }
      }
    });
  }
}
