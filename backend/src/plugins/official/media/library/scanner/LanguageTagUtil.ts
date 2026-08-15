export default class LanguageTagUtil {
  static canonicalize(raw: string | null): { language: string, languageTag: string } {
    const trimmed = raw?.trim().toLowerCase() ?? '';
    if (trimmed === '' || trimmed === 'und' || trimmed === 'unk') {  // 'unk' = common wild-west filler
      return { language: 'und', languageTag: 'und' };
    }

    try {
      const canonical = Intl.getCanonicalLocales(trimmed)[0];  // 'ger' -> 'de', throws RangeError on garbage
      return { language: new Intl.Locale(canonical).language, languageTag: canonical };
    } catch {
      return { language: 'und', languageTag: 'und' };  // structurally invalid ('Deutsch', '', ...) -> unknown
    }
  }
}
