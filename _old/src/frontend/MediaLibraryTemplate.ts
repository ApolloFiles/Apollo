import * as PrismaClient from '@prisma/client';
import express from 'express';
import Library from '../media/libraries/Library';
import { SimpleTemplate } from './SimpleTemplate';

export type MediaLibraryTemplateData = {
  library: Library;
  titles: PrismaClient.MediaLibraryMedia[];
};

export default class MediaLibraryTemplate extends SimpleTemplate {
  constructor() {
    super('media-media', 'media/library.ejs.html');
  }

  render(req: express.Request, data: MediaLibraryTemplateData): string {
    return super.render(req, data);
  }
}
