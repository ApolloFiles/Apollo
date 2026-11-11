export type MatchableItem = {
  mediaId: bigint,
  seasonNumber: number | null,
  episodeNumber: number | null,
  fileSizeInBytes: bigint | null,
};

/** Only pairs unique on both sides: an ambiguous file gets a new item rather than someone else's */
export default class RenamedItemMatcher {
  static match<N extends MatchableItem, M extends MatchableItem>(newItems: N[], missingItems: M[]): Map<N, M> {
    const matches = new Map<N, M>();
    this.matchUniquely(newItems, missingItems, matches, (item) => `${item.mediaId}|${item.seasonNumber}|${item.episodeNumber}`);
    this.matchUniquely(newItems, missingItems, matches, (item) => item.fileSizeInBytes?.toString() ?? null);
    return matches;
  }

  private static matchUniquely<N extends MatchableItem, M extends MatchableItem>(
    newItems: N[],
    missingItems: M[],
    matches: Map<N, M>,
    keyOf: (item: MatchableItem) => string | null,
  ): void {
    const matchedMissingItems = new Set(matches.values());
    const newItemsByKey = this.groupBy(newItems.filter((item) => !matches.has(item)), keyOf);
    const missingItemsByKey = this.groupBy(missingItems.filter((item) => !matchedMissingItems.has(item)), keyOf);

    for (const [key, newItemsWithKey] of newItemsByKey) {
      const missingItemsWithKey = missingItemsByKey.get(key);
      if (newItemsWithKey.length === 1 && missingItemsWithKey?.length === 1) {
        matches.set(newItemsWithKey[0], missingItemsWithKey[0]);
      }
    }
  }

  private static groupBy<T extends MatchableItem>(items: T[], keyOf: (item: MatchableItem) => string | null): Map<string, T[]> {
    const itemsByKey = new Map<string, T[]>();
    for (const item of items) {
      const key = keyOf(item);
      if (key == null) {
        continue;
      }

      const itemsWithKey = itemsByKey.get(key) ?? [];
      itemsWithKey.push(item);
      itemsByKey.set(key, itemsWithKey);
    }
    return itemsByKey;
  }
}
