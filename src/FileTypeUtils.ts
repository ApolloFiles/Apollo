import ChildProcess from 'child_process';
import * as MimeType from 'mime-types';
import ProcessBuilder from './process_manager/ProcessBuilder';

export default class FileTypeUtils {
  protected useFileApp: boolean;

  /**
   * @param useFileApp undefined checks if `file` is available on the system and uses it if it is.
   */
  constructor(useFileApp?: boolean) {
    this.useFileApp = useFileApp ?? FileTypeUtils.isFileAppAvailable();
  }

  // TODO: add support für path array
  async getMimeType(path: string): Promise<string | null> {
    let fileMimeType: string | null = null;

    if (this.useFileApp) {
      fileMimeType = await FileTypeUtils.getMimeTypeFromFileApp(path);
    }

    if (fileMimeType == null ||
        fileMimeType == 'inode/x-empty' ||
        (fileMimeType == 'application/octet-stream' && path.toLowerCase().endsWith('.mp3'))) {
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
  private static async getMimeTypeFromFileApp(path: string): Promise<string | null> {
    const childProcessArgs = ['--mime-type', '--preserve-date', '--separator=', '-E', '--raw', '--print0', path];
    const childProcessResult = await new ProcessBuilder('file', childProcessArgs)
        .errorOnNonZeroExit()
        .bufferStdOut()
        .runPromised();

    if (childProcessResult.err) {
      if (childProcessResult.process.bufferedStdOut.includes('No such file or directory')) {
        return null;
      }

      throw childProcessResult.err;
    }

    const args = childProcessResult.process.bufferedStdOut.toString('utf-8').split('\0');

    if (args.length !== 2) {
      throw new Error(`Invalid output from 'file': ${args}`);
    }

    return args[1].trim() || null;
  }

  static isFileAppAvailable(): boolean {
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
