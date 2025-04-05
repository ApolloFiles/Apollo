import Fs from 'node:fs';
import { getPrismaClient } from '../../Constants';
import VirtualFile from '../../user/files/VirtualFile';

export default class FileIndexTable {
  private static INSTANCE: FileIndexTable;

  protected constructor() {
  }

  async isFileUpToDate(file: VirtualFile, fileStats: Fs.Stats): Promise<boolean> {
    const dbRes = await getPrismaClient()!.fileSearchIndexEntry.findFirst({
      where: {
        ownerId: file.fileSystem.owner.id,
        filesystem: file.fileSystem.getUniqueId(),
        filePath: file.path,
        isDirectory: fileStats.isDirectory(),
        sizeBytes: fileStats.isDirectory() ? null : BigInt(fileStats.size),
      },
      select: {
        ownerId: true,
      },
    });
    return dbRes != null;
  }

  async setFileIndex(file: VirtualFile, fileStats: Fs.Stats, sha256?: Buffer): Promise<void> {
    if (fileStats.isFile() && !(sha256 instanceof Buffer)) {
      throw new Error('SHA256 is required for file indexing');
    }

    const dbRes = await getPrismaClient()!.$executeRaw`
          INSERT INTO files_search_index
            (owner_id, filesystem, file_path, is_directory, size_bytes, sha256, last_modified_at)
          VALUES
            (${file.fileSystem.owner.id}, ${file.fileSystem.getUniqueId()}, ${file.path}, ${fileStats.isDirectory()}, ${fileStats.isDirectory() ? null : fileStats.size}, ${sha256 ?? null}, ${fileStats.mtime})
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
