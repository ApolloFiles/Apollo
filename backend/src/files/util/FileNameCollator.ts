export default class FileNameCollator {
  private static readonly COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'accent' });

  static compare(a: string, b: string): number {
    return FileNameCollator.COLLATOR.compare(a, b);
  }
}
