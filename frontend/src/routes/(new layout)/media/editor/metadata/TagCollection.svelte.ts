export type TagData = { uid: number, key: string, value: string };

export default class TagCollection {
  private static globalUidCounter = 0;

  private readonly _tags: TagData[] = $state([]);
  private _hasUnsavedChanges = $state(false);

  constructor(tags?: Pick<TagData, 'key' | 'value'>[]) {
    if (tags != null) {
      this.pushTags(tags);

      // #pushTags sets it to true, so we reset it in the constructor
      this._hasUnsavedChanges = false;
    }
  }

  /**
   * DO NOT use `bind:` on {@code TagData#key} or {@code TagData#value}
   */
  get tags(): ReadonlyArray<Readonly<TagData>> {
    return this._tags;
  }

  get hasUnsavedChanges(): boolean {
    return this._hasUnsavedChanges;
  }

  hasKey(key: string): boolean {
    return this._tags.some(tag => tag.key === key);
  }

  deleteByUid(uid: number): void {
    const index = this._tags.findIndex(tag => tag.uid === uid);
    if (index === -1) {
      throw new Error(`Tag with uid ${uid} not found`);
    }

    this._tags.splice(index, 1);
    this._hasUnsavedChanges = true;
  }

  deleteAllByKeyCaseInsensitive(key: string): void {
    this.findByKeyCaseInsensitive(key)
      .forEach(tag => this.deleteByUid(tag.uid));
  }

  setValueByUid(uid: number, newValue: string): void {
    const tag = this.findByUid(uid);
    tag.value = newValue;

    this._hasUnsavedChanges = true;
  }

  setKeyByUid(uid: number, newKey: string): void {
    const tag = this.findByUid(uid);
    tag.key = newKey;

    this._hasUnsavedChanges = true;
  }

  findByUid(uid: number): TagData {
    const tag = this._tags.find(tag => tag.uid === uid);
    if (tag == null) {
      throw new Error(`Tag with uid ${uid} not found`);
    }
    return tag;
  }

  findByKeyCaseInsensitive(key: string): TagData[] {
    return this._tags.filter(tag => tag.key.toLowerCase() === key.toLowerCase());
  }

  findByKeyIfUniqueOrNull(key: string): TagData | null {
    const found = this._tags.filter(tag => tag.key === key);
    return found.length === 1 ? found[0] : null;
  }

  pushTag(key: string, value: string): TagData['uid'] {
    const uid = TagCollection.globalUidCounter++;

    this._tags.push({ uid, key, value });
    this._hasUnsavedChanges = true;

    return uid;
  }

  pushEmptyTag(): void {
    this.pushTag('', '');
  }

  pushTags(tags: Pick<TagData, 'key' | 'value'>[]): void {
    for (const tag of tags) {
      this.pushTag(tag.key, tag.value);
    }
  }

  sortTagsByKey(): void {
    this._tags.sort((a, b) => {
      const keyComparison = TagCollection.compareKeysForSorting(a.key, b.key);
      if (keyComparison !== 0) {
        return keyComparison;
      }

      // Move empty keys with empty values, below empty keys with non-empty values
      if (a.value === '' && b.value === '') {
        return 0;
      }
      if (a.value === '') {
        return 1;
      }
      if (b.value === '') {
        return -1;
      }

      return 0;
    });
  }

  static compareKeysForSorting(a: string, b: string): number {
    // sort by key, if both keys are non-empty
    if (a !== '' && b !== '') {
      return a.localeCompare(b, 'en');
    }

    // Move empty keys below non-empty keys
    if (a === '' && b !== '') {
      return 1;
    }
    if (a !== '' && b === '') {
      return -1;
    }

    return 0;
  }
}
