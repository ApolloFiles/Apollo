import express from 'express';
import Library from '../media/libraries/Library';
import {SimpleTemplate} from './SimpleTemplate';

export type MediaTemplateData = {
  libraries: Library[];
};

export default class MediaTemplate extends SimpleTemplate {
  constructor() {
    super('media-media', 'media/media.ejs.html');
  }

  render(req: express.Request, data: MediaTemplateData): string {
    return super.render(req, data);
  }
}
