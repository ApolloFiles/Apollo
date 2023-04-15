import express from 'express';
import Fs from 'node:fs';
import Path from 'node:path';
import IUserFile from './files/IUserFile';

export default class Utils {
  static async sendFileRespectingRequestedRange(req: express.Request, res: express.Response, next: express.NextFunction, file: string | IUserFile, mimeType: string, sendAsAttachment: boolean = false): Promise<void> {
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

    const readStreamOptions = {start: bytesStart, end: bytesEnd};
    const fileReadStream = typeof file == 'string' ?
        Fs.createReadStream(file, readStreamOptions) :
        file.getReadStream(readStreamOptions);

    fileReadStream.on('error', (err) => {
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
      res.setHeader('Content-Disposition', `attachment; filename="${Utils.tryReplacingBadCharactersForFileName(typeof file == 'string' ? Path.basename(file) : file.getName())}"`);
    }

    res.setHeader('Content-Length', fileSize);
    if (bytesStart != undefined && bytesEnd != undefined) {
      res.status(206);
      res.setHeader('Content-Length', bytesEnd - bytesStart + 1);
      res.setHeader('Content-Range', `bytes ${bytesStart}-${bytesEnd}/${fileSize}`);
    }

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
}
