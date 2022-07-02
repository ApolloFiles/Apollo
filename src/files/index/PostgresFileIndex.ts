import Crypto from 'crypto';
import AbstractUser from '../../AbstractUser';
import FileIndexTable from '../../database/postgres/FileIndexTable';
import IUserFileSystem from '../filesystems/IUserFileSystem';
import IUserFile from '../IUserFile';
import FileIndex from './FileIndex';

export default class PostgresFileIndex implements FileIndex {
  async search(startDir: IUserFile, query: string, page = 1): Promise<IUserFile[]> {
    if (page <= 0) {
      throw new Error('Page must be greater than 0');
    }

    return FileIndexTable.getInstance().search(startDir, query, 100, 100 * (page - 1));
  }

  async refreshIndex(file: IUserFile, recursive: boolean, forceUpdate: boolean = false): Promise<void> {
    await this.refreshIndexForFile(file, forceUpdate);

    if (await file.isFile()) {
      return;
    }

    const files = await file.getFiles();
    const directoriesToRefresh = [];

    for (const file of files) {
      if (await file.isFile()) {
        await this.refreshIndexForFile(file, forceUpdate);

        continue;
      }

      if (!recursive) {
        continue;
      }

      directoriesToRefresh.push(file);
    }

    for (const dir of directoriesToRefresh) {
      await this.refreshIndex(dir, recursive, forceUpdate);
      await this.refreshIndexForFile(dir, forceUpdate);
    }
  }

  async deleteIndex(file: IUserFile): Promise<void> {
    return FileIndexTable.getInstance().deleteFileIndex(file);
  }

  async renameIndex(src: IUserFile, dest: IUserFile): Promise<void> {
    return FileIndexTable.getInstance().renameFileIndex(src, dest);
  }

  async clearIndex(user: AbstractUser, fileSystem?: IUserFileSystem): Promise<void> {
    return FileIndexTable.getInstance().clearFileIndex(user, fileSystem);
  }

  private async refreshIndexForFile(file: IUserFile, forceUpdate: boolean): Promise<void> {
    const stat = await file.stat();

    if (!forceUpdate && await FileIndexTable.getInstance().isFileUpToDate(file, stat)) {
      return;
    }

    if (stat.isDirectory()) {
      return FileIndexTable.getInstance().setFileIndex(file, stat);
    }

    return new Promise((resolve, reject) => {
      const fileReadStream = file.getReadStream();
      const hash = Crypto.createHash('sha256');

      fileReadStream.on('error', reject);
      hash.on('error', reject);

      fileReadStream.on('end', () => {
        hash.end();
        fileReadStream.destroy();

        const sha256 = hash.read();
        if (!(sha256 instanceof Buffer)) {
          throw new Error('sha256 is not a buffer');
        }

        FileIndexTable.getInstance().setFileIndex(file, stat, sha256)
            .then(resolve)
            .catch(reject);
      });

      fileReadStream.pipe(hash);
    });
  }
}
