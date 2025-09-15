// not used now, might be useful later: gin dictionary that does not have any stop words (e.g. 'of', 'and', 'the', etc.) which would make it harder to search for words like 'of'
//   CREATE TEXT SEARCH DICTIONARY english_stem_nostop (Template = snowball, Language = english);
//   CREATE TEXT SEARCH CONFIGURATION public.english_nostop (COPY = pg_catalog.english);
//   ALTER TEXT SEARCH CONFIGURATION public.english_nostop ALTER MAPPING FOR asciiword, asciihword, hword_asciipart, hword, hword_part, word WITH english_stem_nostop;
export default class PostgresDatabase {
  static escapeForLikePattern(input: string): string {
    return input.replace(/#/g, '##')
      .replace(/_/g, '#_')
      .replace(/%/g, '#%');
  }
}
