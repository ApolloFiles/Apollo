import * as PrismaClient from '@prisma/client';
import express from 'express';
import Library from '../media/libraries/Library';
import { SimpleTemplate } from './SimpleTemplate';

export type MediaLibraryTitleData = {
  library: Library;
  title: PrismaClient.MediaLibraryMedia;
  media: Map<string, PrismaClient.MediaLibraryMediaItem[]>;
};

export default class MediaLibraryTitleTemplate extends SimpleTemplate {
  constructor() {
    super('media-media', 'media/title.ejs.html');
  }

  render(req: express.Request, data: MediaLibraryTitleData): string {
    return super.render(req, data);
  }
}
