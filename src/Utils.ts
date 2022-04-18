import express from 'express';

// TODO: Move to SpraxDev/Node-Commons
export default class Utils {
  /**
   * This shortcut function responses with HTTP 405 to the requests having
   * a method that does not have corresponding request handler.
   *
   * For example if a resource allows only GET and POST requests then
   * PUT, DELETE, etc. requests will be responded with the 405.
   *
   * HTTP 405 is required to have Allow-header set to a list of allowed
   * methods so in this case the response has "Allow: GET, POST, HEAD" in its headers.
   *
   * Example usage
   *
   *    // A handler that allows only GET (and HEAD) requests and returns
   *    app.all('/path', (req, res, next) => {
   *      restful(req, res, {
   *        get: () => {
   *          res.send('Hello world!');
   *        }
   *      });
   *    });
   *
   * Original author: https://stackoverflow.com/a/15754373/9346616
   */
  static restful(req: express.Request, res: express.Response, next: express.NextFunction, handlers: { [key: string]: () => void | Promise<void> }): void {
    const method = (req.method || '').toLowerCase();

    if (method in handlers) {
      try {
        const handlerResult = handlers[method]();

        if (handlerResult instanceof Promise) {
          handlerResult.catch(next);
        }
      } catch (err) {
        next(err);
      }
    } else if (method == 'head' && 'get' in handlers) {
      try {
        const handlerResult = handlers['get']();

        if (handlerResult instanceof Promise) {
          handlerResult.catch(next);
        }
      } catch (err) {
        next(err);
      }
    } else {
      const allowedMethods: string[] = Object.keys(handlers);
      if (!allowedMethods.includes('head')) {
        allowedMethods.push('head');
      }

      res.set('Allow', allowedMethods.join(', ').toUpperCase());
      res.sendStatus(405);  // TODO: send error-custom body
    }
  }

  static prettifyFileSize(bytes: number, si: boolean = false): string {
    const units = si ?
        ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'] :
        ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];

    let i = Math.floor(Math.log(bytes) / Math.log(1024));
    if (i < 0) {
      i = 0;
    }

    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + units[i];
  }

  static tryReplacingBadCharactersForFileName(fileName: string): string {
    return fileName.replace(/[\\/:*?"<>|]/g, '_');
  }
}
