import type express from 'express';
import Fs from 'node:fs';
import Path from 'node:path';
import VirtualFile from './user/files/VirtualFile';

export default class Utils {
  static async sendFileRespectingRequestedRange(req: express.Request, res: express.Response, file: string | VirtualFile, mimeType: string, sendAsAttachment: boolean = false): Promise<void> {
    let fileStat: Fs.Stats;

    if (typeof file === 'string') {
      if (!Path.isAbsolute(file)) {
        throw new Error('File path is not absolute');
      }

      fileStat = await Fs.promises.stat(file);
    } else {
      fileStat = await file.stat();
    }

    const fileSize = fileStat.size;
    const parsedRange = req.range(fileSize);

    let bytesStart = undefined;
    let bytesEnd = undefined;
    if (Array.isArray(parsedRange)) {
      bytesStart = parsedRange[0].start;
      bytesEnd = parsedRange[0].end;

      if (bytesEnd > fileSize) {
        res.status(416)
          .send(`Requested range not satisfiable (file has ${fileSize} bytes)`);
        return;
      }
    }

    const readStreamOptions = { start: bytesStart, end: bytesEnd };
    const fileReadStream = typeof file == 'string' ?
      Fs.createReadStream(file, readStreamOptions) :
      file.getReadStream(readStreamOptions);

    fileReadStream.on('error', (err: any) => {
      console.error(err);

      fileReadStream.destroy();
      res.end();
    });

    res.on('close', () => {
      fileReadStream.destroy();
    });

    res.type(mimeType);
    res.setHeader('Accept-Ranges', 'bytes');

    if (sendAsAttachment) {
      res.setHeader('Content-Disposition', `attachment; filename="${Utils.tryReplacingBadCharactersForFileName(typeof file == 'string' ? Path.basename(file) : file.getFileName())}"`);
    }

    res.setHeader('Content-Length', fileSize);
    if (bytesStart != undefined && bytesEnd != undefined) {
      res.status(206);
      res.setHeader('Content-Length', bytesEnd - bytesStart + 1);
      res.setHeader('Content-Range', `bytes ${bytesStart}-${bytesEnd}/${fileSize}`);
    }

    res.locals.timings?.setHttpHeader(res);

    fileReadStream.pipe(res);
  }

  static prettifyFileSize(bytes: number, si: boolean = false): string {
    if (bytes < 0 || !Number.isFinite(bytes)) {
      throw new Error('The given bytes need to be a positive number');
    }

    const base = si ? 1000 : 1024;
    const units = si ?
      ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'] :
      ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];

    let i = Math.floor(Math.log(bytes) / Math.log(base));
    if (i < 0) {
      i = 0;
    } else if (i >= units.length) {
      i = units.length - 1;
    }

    return (bytes / Math.pow(base, i)).toFixed(i > 0 ? 2 : 0) + ' ' + units[i];
  }

  static tryReplacingBadCharactersForFileName(fileName: string): string {
    return fileName.replace(/[\\/:*?"<>|]/g, '_');
  }

  /**
   * @author https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze
   */
  static deepFreeze(object: any): void {
    const propNames = Object.getOwnPropertyNames(object);

    for (const name of propNames) {
      const value = object[name];

      if (value && typeof value === 'object') {
        this.deepFreeze(value);
      }
    }

    Object.freeze(object);
  }

  static escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  static decodeUriProperly(uri: string): string {
    return uri.split('/')
      .map(decodeURIComponent)
      .join('/');
  }

  static encodeUriProperly(uri: string): string {
    return uri.split('/')
      .map(encodeURIComponent)
      .join('/');
  }

  static decodeUriIntoItsComponents(uri: string): string[] {
    return uri.split('/')
      .map(decodeURIComponent)
      .filter((value) => value.length > 0);
  }

  /*
   * TODO: Into own class and when creating the symlink, try creating a hardlink first into a separate folder and symlink that one
   *       symlinking the 'extracted' hardlink keeps the app-isolation kind of intact (resolving the hardlink does not potentially end up in user space [and hardlinks are basically free])
   *       This directory needs to be cleaned as soon as the file is no longer needed so maybe it's not worth the hassle?
   *       Also there should be some kind of auto-detection or flag to use when symlinking from APP_DIR to APP_TMP_DIR and not try hardlink every time when it fails once
   */
  static async createHardLinkAndFallbackToSymbolicLinkIfCrossDevice(source: string, target: string): Promise<void> {
    try {
      await Fs.promises.link(source, target);
    } catch (err: any) {
      if (err.errno === -18 && err.code === 'EXDEV') {
        await Fs.promises.symlink(source, target);
      }
    }
  }
}
