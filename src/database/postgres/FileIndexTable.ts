import Fs from 'node:fs';
import Path from 'node:path';
import AbstractUser from '../../AbstractUser';
import { getSqlDatabase } from '../../Constants';
import IUserFileSystem from '../../files/filesystems/IUserFileSystem';
import IUserFile from '../../files/IUserFile';
import SqlDatabase from '../SqlDatabase';
import PostgresDatabase from './PostgresDatabase';

export default class FileIndexTable {
  private static INSTANCE: FileIndexTable;

  protected constructor() {
  }

  async search(startDir: IUserFile, userQuery: string, limit = 100, offset = 0): Promise<IUserFile[]> {
    const startDirPattern = PostgresDatabase.escapeForLikePattern(Path.join(startDir.getPath(), '/')) + '%';
    const userQueryPattern = '%' + PostgresDatabase.escapeForLikePattern(userQuery) + '%';

    const dbRes = await FileIndexTable.getClient().query(
      `SELECT file_path
         FROM user_file_index
         WHERE owner_id = $1
           AND filesystem = $2
           AND file_path LIKE $3 ESCAPE '#'
             AND basename(file_path)
             ILIKE $4 ESCAPE '#'
         ORDER BY is_directory ASC, file_path ASC
         OFFSET $5 LIMIT $6;`,
      [startDir.getOwner().getId(), startDir.getFileSystem().getUniqueId(), startDirPattern, userQueryPattern, offset, limit]
    );

    const files: IUserFile[] = [];
    for (const row of dbRes.rows) {
      files.push(startDir.getFileSystem().getFile(row.file_path));
    }
    return files;
  }

  async isFileUpToDate(file: IUserFile, fileStats: Fs.Stats): Promise<boolean> {
    const dbRes = await FileIndexTable.getClient().query(
      `SELECT EXISTS(
                        SELECT
                        FROM user_file_index
                        WHERE owner_id = $1
                          AND filesystem = $2
                          AND file_path = $3
                          AND is_directory = $4
                          AND size_bytes = $5);`,
      [
        file.getOwner().getId(),
        file.getFileSystem().getUniqueId(),
        file.getPath(),
        fileStats.isDirectory(),
        fileStats.size
      ]
    );

    return dbRes.rows[0].exists;
  }

  async setFileIndex(file: IUserFile, fileStats: Fs.Stats, sha256?: Buffer): Promise<void> {
    if (fileStats.isFile() && !(sha256 instanceof Buffer)) {
      throw new Error('SHA256 is required for file indexing');
    }

    const dbRes = await FileIndexTable.getClient().query(
      `
          INSERT INTO user_file_index
            (owner_id, filesystem, file_path, is_directory, size_bytes, sha256, last_modification)
          VALUES
            ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT
            (owner_id, filesystem, file_path)
          DO UPDATE SET
            is_directory = $4,
            size_bytes = $5,
            sha256 = $6,
            last_modification = $7,
            last_validation = CURRENT_TIMESTAMP;`,
      [file.getOwner().getId(),
        file.getFileSystem().getUniqueId(),
        file.getPath(),
        fileStats.isDirectory(),
        fileStats.isDirectory() ? null : fileStats.size,
        sha256 ?? null,
        fileStats.mtime
      ]
    );

    if (dbRes.rowCount !== 1) {
      throw new Error('Failed to insert file index');
    }
  }

  async deleteFileIndex(file: IUserFile): Promise<void> {
    const client = await FileIndexTable.getClient().getConnection();

    try {
      const ownerId: AbstractUser['id'] = file.getOwner().getId();
      const fileSystemId: string = file.getFileSystem().getUniqueId();

      await client.query('BEGIN;');

      // Delete the entry itself
      await client.query(
        `DELETE
           FROM user_file_index
           WHERE owner_id = $1
             AND filesystem = $2
             AND file_path = $3;`,
        [ownerId, fileSystemId, file.getPath()]
      );

      // Delete all the entries inside itself (for directories)
      await client.query(
        `DELETE
           FROM user_file_index
           WHERE owner_id = $1
             AND filesystem = $2
             AND file_path LIKE $3 ESCAPE '#';`,
        [ownerId, fileSystemId, PostgresDatabase.escapeForLikePattern(Path.join(file.getPath(), '/')) + '%']
      );

      await client.query('COMMIT;');
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  async renameFileIndex(src: IUserFile, dest: IUserFile): Promise<void> {
    const client = await FileIndexTable.getClient().getConnection();

    try {
      await client.query('BEGIN;');

      // Update the entry itself
      await client.query(
        `
              UPDATE user_file_index
              SET owner_id   = $4,
                  filesystem = $5,
                  file_path  = $6
              WHERE owner_id = $1
                AND filesystem = $2
                AND file_path = $3;`,
        [
          src.getOwner().getId(), src.getFileSystem().getUniqueId(), src.getPath(),
          dest.getOwner().getId(), dest.getFileSystem().getUniqueId(), dest.getPath()
        ]
      );

      // Update all the entries inside itself (for directories)
      await client.query(
        `UPDATE user_file_index
           SET owner_id   = $5,
               filesystem = $6,
               file_path  = $7 || substr(file_path, length($3) + 1)
           WHERE owner_id = $1
             AND filesystem = $2
             AND file_path LIKE $4;`,
        [
          src.getOwner().getId(), src.getFileSystem().getUniqueId(), Path.join(src.getPath(), '/'), PostgresDatabase.escapeForLikePattern(Path.join(src.getPath(), '/')) + '%',
          dest.getOwner().getId(), dest.getFileSystem().getUniqueId(), Path.join(dest.getPath(), '/')
        ]
      );

      await client.query('COMMIT;');
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  async clearFileIndex(user: AbstractUser, fileSystem?: IUserFileSystem): Promise<void> {
    let query = `DELETE
                 FROM user_file_index
                 WHERE owner_id = $1`;

    if (fileSystem != null) {
      query += ` AND filesystem = $2`;
    }

    await FileIndexTable.getClient().query(query, [user.getId(), fileSystem?.getUniqueId()]);
  }

  async estimateIndexCount(user: AbstractUser, fileSystem?: IUserFileSystem): Promise<number> {
    const countQuery = `SELECT count(*) as estimate
                        FROM user_file_index
                        WHERE owner_id = $1 ${fileSystem ? 'AND file_system = $2' : ''};`;

    const dbRes = await FileIndexTable.getClient().query(
      `SELECT count_estimate(${countQuery}) as estimate`,
      [user.getId(), fileSystem ? fileSystem.getUniqueId() : '']
    );

    return dbRes.rows[0].estimate;
  }

  private static getClient(): SqlDatabase {
    const client = getSqlDatabase();
    if (client == null) {
      throw new Error('SqlDatabase is not initialized');
    }

    return client;
  }

  static getInstance(): FileIndexTable {
    if (this.INSTANCE == null) {
      this.INSTANCE = new FileIndexTable();
    }

    return this.INSTANCE;
  }
}
