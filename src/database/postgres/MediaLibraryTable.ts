import Path from 'node:path';
import AbstractUser from '../../AbstractUser';
import { getSqlDatabase } from '../../Constants';
import IUserFile from '../../files/IUserFile';
import Library from '../../media/libraries/Library';
import SqlDatabase from '../SqlDatabase';

export interface LibraryTitle {
  readonly id: string;
  readonly libraryId: string;
  readonly directoryPath: string;
  readonly title: string;
  readonly synopsis: string | null;
}

export interface LibraryMedia {
  readonly filePath: string;
  readonly name: string;
  readonly season: number | null;
  readonly episode: number | null;
  readonly lastScannedAt: Date;
  readonly addedAt: Date;
  readonly durationInSeconds: number;
}

export default class MediaLibraryTable {
  private static INSTANCE: MediaLibraryTable;

  protected constructor() {
  }

  async getLibraries(user: AbstractUser): Promise<Library[]> {
    const dbRes = await MediaLibraryTable.getClient().query(
      `SELECT id, name, directory_paths
       FROM media_libraries
       WHERE owner_id = $1
       ORDER BY name;`,
      [user.getId()]
    );

    const libraries: Library[] = [];
    for (const row of dbRes.rows) {
      libraries.push(MediaLibraryTable.createLibraryFromRow(user, row));
    }
    return libraries;
  }

  async getLibraryTitlesOrderedRecentFirst(libraryId: string): Promise<LibraryTitle[]> {
    const dbRes = await MediaLibraryTable.getClient().query(
      `SELECT
                title_id, library_id, directory_path, title, synopsis
             FROM
                media_library_titles
             WHERE
                library_id = $1
             ORDER BY
                added_at DESC;`,
      [libraryId]
    );

    const titles: LibraryTitle[] = [];
    for (const row of dbRes.rows) {
      titles.push({
        id: row.title_id,
        libraryId: row.library_id,
        directoryPath: row.directory_path,
        title: row.title,
        synopsis: row.synopsis
      });
    }
    return titles;
  }

  async getLibraryTitle(libraryId: string, titleId: string): Promise<LibraryTitle | null> {
    const dbRes = await MediaLibraryTable.getClient().query(
      `SELECT
                title_id, library_id, directory_path, title, synopsis
             FROM
                media_library_titles
             WHERE
                library_id = $1
                AND title_id = $2;`,
      [libraryId, titleId]
    );

    if (dbRes.rowCount === 0) {
      return null;
    }
    const row = dbRes.rows[0];
    return {
      id: row.title_id,
      libraryId: row.library_id,
      directoryPath: row.directory_path,
      title: row.title,
      synopsis: row.synopsis
    };
  }

  async getLibraryMedia(libraryId: string, titleId: string, mediaFilePath: string): Promise<LibraryMedia | null> {
    const dbRest = await MediaLibraryTable.getClient().query(
      `SELECT
                 file_path,
                 name,
                 season_number,
                 episode_number,
                 last_scanned_at,
                 added_at,
                 duration_in_seconds
             FROM
                 media_library_media
             WHERE
                 library_id = $1
                 AND
                 title_id = $2
                 AND
                 file_path = $3;`,
      [libraryId, titleId, mediaFilePath]
    );

    if (dbRest.rowCount === 0) {
      return null;
    }

    const row = dbRest.rows[0];
    return {
      filePath: row.file_path,
      name: row.name,
      season: row.season_number,
      episode: row.episode_number,
      lastScannedAt: row.last_scanned_at,
      addedAt: row.added_at,
      durationInSeconds: row.duration_in_seconds
    };
  }

  async getLibraryMediaByTitleOrderedBySeasonAndEpisode(libraryId: string, titleId: string): Promise<LibraryMedia[]> {
    const dbRes = await MediaLibraryTable.getClient().query(`
SELECT
    media_library_media.file_path,
    media_library_media.name,
    media_library_media.season_number,
    media_library_media.episode_number,
    media_library_media.last_scanned_at,
    media_library_media.added_at,
    media_library_media.duration_in_seconds
FROM
    media_library_media
INNER JOIN
    media_library_titles mlt
    ON
      mlt.title_id = media_library_media.title_id
      AND
      mlt.library_id = media_library_media.library_id
WHERE
    media_library_media.library_id = $1
    AND
    media_library_media.title_id = $2
ORDER BY
    media_library_media.season_number,
    media_library_media.episode_number;`,
      [libraryId, titleId]
    );

    const media: LibraryMedia[] = [];
    for (const row of dbRes.rows) {
      media.push({
        filePath: row.file_path,
        name: row.name,
        season: row.season_number,
        episode: row.episode_number,
        lastScannedAt: row.last_scanned_at,
        addedAt: row.added_at,
        durationInSeconds: row.duration_in_seconds
      });
    }
    return media;
  }

  async getLibrary(user: AbstractUser, libraryId: string): Promise<Library | null> {
    const dbRes = await MediaLibraryTable.getClient().query(
      `SELECT id, name, directory_paths
       FROM media_libraries
       WHERE owner_id = $1
         AND id = $2;`,
      [user.getId(), libraryId]
    );

    if (dbRes.rowCount === 0) {
      return null;
    }
    return MediaLibraryTable.createLibraryFromRow(user, dbRes.rows[0]);
  }

  async updateLibraryTitle(libraryId: string, directoryPath: string, title: string): Promise<string> {
    const dbRes = await MediaLibraryTable.getClient().query(
      `INSERT INTO media_library_titles (library_id, directory_path, title)
        VALUES ($1, $2, $3)
        ON CONFLICT (library_id, directory_path)
        DO UPDATE SET title = $3
        RETURNING title_id;`,
      [libraryId, directoryPath, title]
    );

    return dbRes.rows[0].title_id;
  }

  async updateLibraryTitleMetaData(titleId: string, synopsis: string | null): Promise<void> {
    await MediaLibraryTable.getClient().query(
      `UPDATE
        media_library_titles
      SET
        synopsis = $2
      WHERE
        title_id = $1;`,
      [titleId, synopsis]
    );
  }

  async updateLibraryMedia(libraryId: string, filePath: string, titleId: string, name: string, seasonNumber: number | null, episodeNumber: number | null, lastScannedAt: Date, durationInSeconds: number): Promise<void> {
    await MediaLibraryTable.getClient().query(
      `INSERT INTO media_library_media (library_id, file_path, title_id, name, season_number, episode_number, last_scanned_at, duration_in_seconds)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (library_id, file_path)
       DO UPDATE SET title_id = $3, name = $4, season_number = $5, episode_number = $6, last_scanned_at = $7, duration_in_seconds = $8;`,
      [libraryId, filePath, titleId, name, seasonNumber, episodeNumber, lastScannedAt, durationInSeconds]
    );
  }

  async deleteMediaEntriesWithinDirectoryBeforeLastScannedAt(libraryId: string, directoryPath: string, lastScannedAt: Date): Promise<void> {
    await MediaLibraryTable.getClient().query(
      `DELETE
       FROM media_library_media
       WHERE library_id = $1
         AND file_path LIKE $2
         AND last_scanned_at < $3;`,
      [libraryId, `${Path.join(directoryPath, '/')}%`, lastScannedAt]
    );
  }

  async deleteMediaEntriesBeforeLastScannedAt(libraryId: string, lastScannedAt: Date): Promise<void> {
    await MediaLibraryTable.getClient().query(
      `DELETE
       FROM media_library_media
       WHERE library_id = $1
         AND last_scanned_at < $2;`,
      [libraryId, lastScannedAt]
    );
  }

  async deleteMediaTitlesWithoutMediaEntries(libraryId: string): Promise<void> {
    await MediaLibraryTable.getClient().query(
      `DELETE
       FROM media_library_titles
       WHERE library_id = $1
         AND NOT exists(
           SELECT
           FROM media_library_media
           WHERE media_library_media.title_id = media_library_titles.title_id
         );`,
      [libraryId]
    );
  }

  static getInstance(): MediaLibraryTable {
    if (this.INSTANCE == null) {
      this.INSTANCE = new MediaLibraryTable();
    }

    return this.INSTANCE;
  }

  private static createLibraryFromRow(user: AbstractUser, row: any): Library {
    const directories: IUserFile[] = [];
    for (const directoryPath of row.directory_paths) {
      directories.push(user.getDefaultFileSystem().getFile(directoryPath));
    }

    return new Library(user, row.id, row.name, directories);
  }

  private static getClient(): SqlDatabase {
    const client = getSqlDatabase();
    if (client == null) {
      throw new Error('SqlDatabase is not initialized');
    }

    return client;
  }
}
