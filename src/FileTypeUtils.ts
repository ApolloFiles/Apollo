import ChildProcess from 'child_process';
import * as MimeType from 'mime-types';

export default class FileTypeUtils {
  protected useFileApp: boolean;

  constructor() {
    this.useFileApp = FileTypeUtils.isFileAppAvailable();
  }

  // TODO: add support für path array
  async getMimeType(path: string): Promise<string | null> {
    let fileMimeType = await this.getMimeTypeFromFileApp(path);

    if (fileMimeType == null || fileMimeType == 'inode/x-empty') {
      const lookUpByExtension = MimeType.lookup(path);

      if (lookUpByExtension) {
        fileMimeType = lookUpByExtension;
      }
    }

    if (fileMimeType == 'inode/x-empty') {
      return 'text/plain';
    }

    return fileMimeType;
  }

  // TODO: add support für path array
  private async getMimeTypeFromFileApp(path: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const fileProcess = ChildProcess.spawn('file', ['--mime-type', '--preserve-date', '--separator=', '-E', '--raw', '--print0', path],
          {stdio: ['ignore', 'pipe', 'pipe']});

      fileProcess.on('error', reject);

      let stdout = '';
      fileProcess.stdout.on('data', (data) => {
        stdout += data;
      });

      fileProcess.on('close', (code) => {
        const args = stdout.toString().split('\0');

        if (args.length != 2) {
          reject(new Error(`Invalid output from 'file': ${args}`));
          return;
        }

        if (code == 0) {
          resolve(args[1].trim() || null);
          return;
        }

        reject(new Error(`'file' exited with code ${code}: ${stdout}`));
      });
    });
  }

  protected static isFileAppAvailable(): boolean {
    const fileProcess = ChildProcess.spawnSync('file', ['--version']);

    if (fileProcess.error) {
      if ((fileProcess.error as any)?.code == 'ENOENT') {
        return false;
      }

      throw fileProcess.error;
    }

    return fileProcess.status == 0;
  }
}
