import Crypto from 'node:crypto';
import Path from 'node:path';
import AbstractUser from '../../AbstractUser';
import { getPrismaClient } from '../../Constants';
import FileIndexTable from '../../database/postgres/FileIndexTable';
import PostgresDatabase from '../../database/postgres/PostgresDatabase';
import IUserFileSystem from '../filesystems/IUserFileSystem';
import IUserFile from '../IUserFile';
import FileIndex from './FileIndex';

export default class PostgresFileIndex implements FileIndex {
  async search(startDir: IUserFile, query: string, page = 1): Promise<IUserFile[]> {
    if (page <= 0) {
      throw new Error('Page must be greater than 0');
    }

    const startDirPattern = PostgresDatabase.escapeForLikePattern(Path.join(startDir.getPath(), '/')) + '%';
    const userQueryPattern = '%' + PostgresDatabase.escapeForLikePattern(query) + '%';

    const limit = 100;
    const offset = limit * (page - 1);

    const dbRes = await getPrismaClient()!.$queryRaw`SELECT file_path
         FROM files_search_index
         WHERE owner_id = ${startDir.getOwner().getId()}
           AND filesystem = ${startDir.getFileSystem().getUniqueId()}
           AND file_path LIKE ${startDirPattern} ESCAPE '#'
             AND basename(file_path)
             ILIKE ${userQueryPattern} ESCAPE '#'
         ORDER BY is_directory ASC, file_path ASC
         OFFSET ${offset} LIMIT ${limit};`;


    const files: IUserFile[] = [];
    for (const row of (dbRes as any)) {
      files.push(startDir.getFileSystem().getFile(row.file_path));
    }
    return files;
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
    await getPrismaClient()!.fileSearchIndexEntry.deleteMany({
      where: {
        AND: {
          ownerId: BigInt(file.getOwner().getId()),
          filesystem: file.getFileSystem().getUniqueId()
        },
        OR: [
          { filePath: file.getPath() },
          { filePath: { startsWith: Path.join(file.getPath(), '/') } }
        ]
      }
    });
  }

  async renameIndex(src: IUserFile, dest: IUserFile): Promise<void> {
    await getPrismaClient()!.fileSearchIndexEntry.updateMany({
      where: {
        ownerId: BigInt(src.getOwner().getId()),
        filesystem: src.getFileSystem().getUniqueId(),
        filePath: src.getPath()
      },
      data: {
        ownerId: BigInt(dest.getOwner().getId()),
        filesystem: dest.getFileSystem().getUniqueId(),
        filePath: dest.getPath()
      }
    });

    getPrismaClient()!.$executeRaw`UPDATE user_file_index
     SET owner_id   = ${dest.getOwner().getId()},
         filesystem = ${dest.getFileSystem().getUniqueId()},
         file_path  = ${Path.join(dest.getPath(), '/')} || substr(file_path, ${Path.join(src.getPath(), '/').length + 1})
     WHERE owner_id = ${src.getOwner().getId()}
       AND filesystem = ${src.getFileSystem().getUniqueId()}
       AND file_path LIKE ${PostgresDatabase.escapeForLikePattern(Path.join(src.getPath(), '/')) + '%'};`;
  }

  async clearIndex(user: AbstractUser, fileSystem?: IUserFileSystem): Promise<void> {
    await getPrismaClient()!.fileSearchIndexEntry.deleteMany({
      where: {
        ownerId: BigInt(user.getId()),
        filesystem: fileSystem?.getUniqueId()
      }
    });
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
