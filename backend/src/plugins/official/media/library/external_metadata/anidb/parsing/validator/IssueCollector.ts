import type { ClassifiedId, NormalizedLanguage } from '../Anime.js';

/** @internal */
export type ParseIssue = {
  kind: 'unknown-value' | 'unknown-key',
  path: string,
  value: string | number,
};

/** @internal */
export class IssueCollector {
  private readonly issues = new Map<string, ParseIssue>();

  checkValue(path: string, knownValues: readonly string[], value: string): void {
    if (!knownValues.includes(value)) {
      this.add({ kind: 'unknown-value', value, path });
    }
  }

  checkClassified(path: string, classified: ClassifiedId<string>): void {
    if (classified.name == null) {
      this.add({ kind: 'unknown-value', value: classified.id, path });
    }
  }

  checkLanguage(path: string, language: NormalizedLanguage): void {
    if (language.bcp47 == null) {
      this.add({ kind: 'unknown-value', value: language.raw, path });
    }
  }

  addUnknownKey(path: string, key: string): void {
    this.add({ kind: 'unknown-key', value: key, path });
  }

  toArray(): ParseIssue[] {
    return [...this.issues.values()];
  }

  private add(issue: ParseIssue): void {
    this.issues.set(`${issue.path}\0${issue.value}`, issue);
  }
}
