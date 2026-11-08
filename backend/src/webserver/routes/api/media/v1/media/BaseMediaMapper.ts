import type { BaseMediaRow } from '../../../../../../plugins/official/media/library/database/media/MediaQueryFragments.js';
import type { BaseMediaDto } from './MediaSchemas.js';

/** @internal */
export class BaseMediaMapper {
  static toDto(row: BaseMediaRow, type: BaseMediaDto['type']): BaseMediaDto {
    return {
      id: row.id.toString(),
      libraryId: row.libraryId.toString(),
      type,
      title: row.title,
      year: row.year,
    };
  }
}
