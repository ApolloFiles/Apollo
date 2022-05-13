import Ejs from 'ejs';
import express from 'express';
import Fs from 'fs';
import Path from 'path';
import { getAppResourcesDir, isProduction } from '../Constants';

export abstract class AbstractTemplate {
  protected static instance: AbstractTemplate;

  protected readonly templateId: string;
  protected readonly ejsFilePath: string;

  protected ejsFileContent?: string;

  protected constructor(templateId: string, ejsFilePath: string) {
    AbstractTemplate.instance = this;

    this.templateId = templateId;
    this.ejsFilePath = ejsFilePath;
  }

  public abstract render(req: express.Request, data?: any): string;

  protected renderEjs(data: object & { global: { templateId: string, req: { body: { [key: string]: unknown } }, apolloConfig: object } }): string {
    Object.freeze(data.global);

    return Ejs.render(this.getTemplateContents(), data, {
      strict: true,
      filename: this.ejsFilePath,
      root: Path.join(getAppResourcesDir(), 'public'),
      cache: isProduction(),
      beautify: false,
      rmWhitespace: false

      // openDelimiter: '%{',
      // closeDelimiter: '}',
      // delimiter: `${level}`,
    });
  }

  protected getTemplateContents(): string {
    if (this.ejsFileContent == null || isProduction()) {
      this.ejsFileContent = Fs.readFileSync(this.ejsFilePath, 'utf8');
    }

    return this.ejsFileContent;
  }
}
