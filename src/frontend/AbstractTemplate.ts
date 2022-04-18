import Ejs from 'ejs';
import Fs from 'fs';
import Path from 'path';
import { getAppResourcesDir, IS_PRODUCTION } from '../Constants';

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

  public abstract render(data?: any): string;

  protected renderEjs(data: object & { global: { templateId: string } }): string {
    Object.freeze(data.global);

    return Ejs.render(this.getTemplateContents(), data, {
      strict: true,
      filename: this.ejsFilePath,
      root: Path.join(getAppResourcesDir(), 'public'),
      cache: IS_PRODUCTION,
      beautify: false,
      rmWhitespace: false

      // openDelimiter: '%{',
      // closeDelimiter: '}',
      // delimiter: `${level}`,
    });
  }

  protected getTemplateContents(): string {
    if (this.ejsFileContent == null || IS_PRODUCTION) {
      this.ejsFileContent = Fs.readFileSync(this.ejsFilePath, 'utf8');
    }

    return this.ejsFileContent;
  }
}
