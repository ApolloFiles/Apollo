import Crypto from 'node:crypto';
import Path from 'node:path';
import { getPrismaClient } from '../../Constants';
import FileIndexTable from '../../database/postgres/FileIndexTable';
import PostgresDatabase from '../../database/postgres/PostgresDatabase';
import ApolloUser from '../../user/ApolloUser';
import VirtualFile from '../../user/files/VirtualFile';
import VirtualFileSystem from '../../user/files/VirtualFileSystem';
import FileIndex from './FileIndex';

export default class PostgresFileIndex implements FileIndex {
  async search(startDir: VirtualFile, query: string, page = 1): Promise<VirtualFile[]> {
    if (page <= 0) {
      throw new Error('Page must be greater than 0');
    }

    const startDirPattern = PostgresDatabase.escapeForLikePattern(Path.join(startDir.path, '/')) + '%';
    const userQueryPattern = '%' + PostgresDatabase.escapeForLikePattern(query) + '%';

    const limit = 100;
    const offset = limit * (page - 1);

    const dbRes = await getPrismaClient()!.$queryRaw`SELECT file_path
         FROM files_search_index
         WHERE owner_id = ${startDir.fileSystem.owner.id}
           AND filesystem = ${startDir.fileSystem.getUniqueId()}
           AND file_path LIKE ${startDirPattern} ESCAPE '#'
             AND basename(file_path)
             ILIKE ${userQueryPattern} ESCAPE '#'
         ORDER BY is_directory ASC, file_path ASC
         OFFSET ${offset} LIMIT ${limit};`;


    const files: VirtualFile[] = [];
    for (const row of (dbRes as any)) {
      files.push(startDir.fileSystem.getFile(row.file_path));
    }
    return files;
  }

  async refreshIndex(file: VirtualFile, recursive: boolean, forceUpdate: boolean = false): Promise<void> {
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

  async deleteIndex(file: VirtualFile): Promise<void> {
    await getPrismaClient()!.fileSearchIndexEntry.deleteMany({
      where: {
        AND: {
          ownerId: file.fileSystem.owner.id,
          filesystem: file.fileSystem.getUniqueId(),
        },
        OR: [
          { filePath: file.path },
          { filePath: { startsWith: Path.join(file.path, '/') } },
        ],
      },
    });
  }

  async renameIndex(src: VirtualFile, dest: VirtualFile): Promise<void> {
    await getPrismaClient()!.fileSearchIndexEntry.updateMany({
      where: {
        ownerId: src.fileSystem.owner.id,
        filesystem: src.fileSystem.getUniqueId(),
        filePath: src.path,
      },
      data: {
        ownerId: dest.fileSystem.owner.id,
        filesystem: dest.fileSystem.getUniqueId(),
        filePath: dest.path,
      },
    });

    getPrismaClient()!.$executeRaw`UPDATE user_file_index
     SET owner_id   = ${dest.fileSystem.owner.id},
         filesystem = ${dest.fileSystem.getUniqueId()},
         file_path  = ${Path.join(dest.path, '/')} || substr(file_path, ${Path.join(src.path, '/').length + 1})
     WHERE owner_id = ${src.fileSystem.owner.id}
       AND filesystem = ${src.fileSystem.getUniqueId()}
       AND file_path LIKE ${PostgresDatabase.escapeForLikePattern(Path.join(src.path, '/')) + '%'};`;
  }

  async clearIndex(user: ApolloUser, fileSystem?: VirtualFileSystem): Promise<void> {
    await getPrismaClient()!.fileSearchIndexEntry.deleteMany({
      where: {
        ownerId: user.id,
        filesystem: fileSystem?.getUniqueId(),
      },
    });
  }

  private async refreshIndexForFile(file: VirtualFile, forceUpdate: boolean): Promise<void> {
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
