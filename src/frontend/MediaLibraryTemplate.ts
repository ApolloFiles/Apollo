import express from 'express';
import { LibraryTitle } from '../database/postgres/MediaLibraryTable';
import Library from '../media/libraries/Library';
import { SimpleTemplate } from './SimpleTemplate';

export type MediaLibraryTemplateData = {
  library: Library;
  titles: LibraryTitle[];
};

export default class MediaLibraryTemplate extends SimpleTemplate {
  constructor() {
    super('media-media', 'media/library.ejs.html');
  }

  render(req: express.Request, data: MediaLibraryTemplateData): string {
    return super.render(req, data);
  }
}
