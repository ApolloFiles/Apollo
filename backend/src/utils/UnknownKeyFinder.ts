export class UnknownKeyFinder {
  static find(raw: unknown, parsed: unknown): string[] {
    const unknownKeys = new Set<string>();
    UnknownKeyFinder.collect(raw, parsed, '', unknownKeys);
    return [...unknownKeys];
  }

  private static collect(raw: unknown, parsed: unknown, path: string, unknownKeys: Set<string>): void {
    if (Array.isArray(raw) && Array.isArray(parsed)) {
      raw.forEach((item, index) => UnknownKeyFinder.collect(item, parsed[index], `${path}[]`, unknownKeys));
      return;
    }

    if (!UnknownKeyFinder.isObject(raw) || !UnknownKeyFinder.isObject(parsed)) {
      return;
    }

    for (const [key, value] of Object.entries(raw)) {
      const keyPath = path === '' ? key : `${path}.${key}`;
      if (Object.hasOwn(parsed, key)) {
        UnknownKeyFinder.collect(value, parsed[key], keyPath, unknownKeys);
      } else {
        unknownKeys.add(keyPath);
      }
    }
  }

  private static isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
