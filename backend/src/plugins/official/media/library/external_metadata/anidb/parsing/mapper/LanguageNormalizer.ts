import { singleton } from 'tsyringe';
import type { NormalizedLanguage } from '../Anime.js';

/** @internal */
@singleton()
export class LanguageNormalizer {
  /**
   * Because AniDB does not document their language codes and some of them "collide" with BCP47/ISO,
   * we use a map of the encountered **and verified** language codes instead.
   *
   * Known AniDB langauge codes that could not yet be verified:
   * * `bs` – Could be Bosnian, Croatian or Serbian Latin; a5303 is the only Anime I could find with that language
   */
  private static readonly ANIDB_TO_BCP47: ReadonlyMap<string, string> = new Map([
    ['x-jat', 'ja-Latn'],
    ['x-kot', 'ko-Latn'],
    ['x-tht', 'th-Latn'],
    ['x-zht', 'zh-Latn'],
    ['x-other', 'und'],
    ['x-unk', 'und'],

    ['al', 'sq'],
    ['bd', 'bn'],
    ['bur', 'my'],
    ['es-CA', 'ca'],
    ['es-GA', 'gl'],
    ['es-PV', 'eu'],
    ['my', 'ms'],
    ['tl', 'fil'],
    ['zh-nan', 'zh-Hant-TW'],

    ['af', 'af'],
    ['ar', 'ar'],
    ['bg', 'bg'],
    ['cs', 'cs'],
    ['da', 'da'],
    ['de', 'de'],
    ['el', 'el'],
    ['en', 'en'],
    ['eo', 'eo'],
    ['es', 'es'],
    ['es-419', 'es-419'],
    ['et', 'et'],
    ['fa', 'fa'],
    ['fi', 'fi'],
    ['fr', 'fr'],
    ['he', 'he'],
    ['hi', 'hi'],
    ['hr', 'hr'],
    ['ht', 'ht'],
    ['hu', 'hu'],
    ['id', 'id'],
    ['is', 'is'],
    ['it', 'it'],
    ['ja', 'ja'],
    ['ka', 'ka'],
    ['ko', 'ko'],
    ['la', 'la'],
    ['lt', 'lt'],
    ['lv', 'lv'],
    ['mn', 'mn'],
    ['ne', 'ne'],
    ['nl', 'nl'],
    ['no', 'no'],
    ['pl', 'pl'],
    ['pt', 'pt'],
    ['pt-BR', 'pt-BR'],
    ['ro', 'ro'],
    ['ru', 'ru'],
    ['si', 'si'],
    ['sk', 'sk'],
    ['sl', 'sl'],
    ['sr', 'sr'],
    ['sv', 'sv'],
    ['ta', 'ta'],
    ['te', 'te'],
    ['th', 'th'],
    ['tr', 'tr'],
    ['tt', 'tt'],
    ['uk', 'uk'],
    ['ur', 'ur'],
    ['vi', 'vi'],
    ['zh', 'zh'],
    ['zh-Hans', 'zh-Hans'],
    ['zh-Hant', 'zh-Hant'],
  ]);

  normalize(raw: string): NormalizedLanguage {
    return {
      raw,
      bcp47: LanguageNormalizer.ANIDB_TO_BCP47.get(raw) ?? null,
    };
  }
}
