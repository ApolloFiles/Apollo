import Fs from 'node:fs';
import { getPrismaClient } from '../../Constants';
import IUserFile from '../../files/IUserFile';

export default class FileIndexTable {
  private static INSTANCE: FileIndexTable;

  protected constructor() {
  }

  async isFileUpToDate(file: IUserFile, fileStats: Fs.Stats): Promise<boolean> {
    const dbRes = await getPrismaClient()!.fileSearchIndexEntry.findFirst({
      where: {
        ownerId: file.getOwner().getId(),
        filesystem: file.getFileSystem().getUniqueId(),
        filePath: file.getPath(),
        isDirectory: fileStats.isDirectory(),
        sizeBytes: fileStats.isDirectory() ? null : BigInt(fileStats.size)
      },
      select: {
        ownerId: true
      }
    });
    return dbRes != null;
  }

  async setFileIndex(file: IUserFile, fileStats: Fs.Stats, sha256?: Buffer): Promise<void> {
    if (fileStats.isFile() && !(sha256 instanceof Buffer)) {
      throw new Error('SHA256 is required for file indexing');
    }

    const dbRes = await getPrismaClient()!.$executeRaw`
          INSERT INTO files_search_index
            (owner_id, filesystem, file_path, is_directory, size_bytes, sha256, last_modified_at)
          VALUES
            (${file.getOwner().getId()}, ${file.getFileSystem().getUniqueId()}, ${file.getPath()}, ${fileStats.isDirectory()}, ${fileStats.isDirectory() ? null : fileStats.size}, ${sha256 ?? null}, ${fileStats.mtime})
          ON CONFLICT
            (owner_id, filesystem, file_path)
          DO UPDATE SET
            is_directory = ${fileStats.isDirectory()},
            size_bytes = ${fileStats.isDirectory() ? null : fileStats.size},
            sha256 = ${sha256 ?? null},
            last_modified_at = ${fileStats.mtime},
            last_validation = CURRENT_TIMESTAMP;`;

    if (dbRes !== 1) {
      throw new Error('Failed to insert file index');
    }
  }

  static getInstance(): FileIndexTable {
    if (this.INSTANCE == null) {
      this.INSTANCE = new FileIndexTable();
    }

    return this.INSTANCE;
  }
}
