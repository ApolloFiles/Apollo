import type {VideoAnalysisResult, WriteVideoTagsApiResponse} from '~/types/FileMetaEditor';

export type ParsedFileMeta = {
  readonly filePath: string;
  readonly name: string;
  readonly formatNameLong: string;
  readonly probeScore: number;
  readonly duration: string;
}

export type ParsedTag = {
  key: string;
  value: string;
}

export type ParsedFileAppState = {
  selected: boolean;
  unsavedChanges: boolean;
}

// FIXME: Setting appState.unsavedChanges to true causes focus lost on input fields which is just *slightly* annoying
export default class ParsedFile {
  private static TAG_COUNTER = 0;

  public readonly meta: ParsedFileMeta;
  public readonly appState: ParsedFileAppState = {selected: false, unsavedChanges: false};

  public readonly fileTags: Map<number, ParsedTag>;
  public readonly streamTags: Map<number, Map<number, ParsedTag>>;

  protected constructor(meta: ParsedFileMeta, fileTags: Map<number, ParsedTag>, streamTags: Map<number, Map<number, ParsedTag>>) {
    this.meta = meta;
    this.fileTags = fileTags;
    this.streamTags = streamTags;
  }

  /* File Tags */

  getFileTagValue(tagKey: string): string | null {
    for (const fileTag of this.fileTags.values()) {
      if (fileTag.key === tagKey) {
        return fileTag.value;
      }
    }
    return null;
  }

  setFileTagValue(tagKey: string, tagValue: string): void {
    for (const fileTag of this.fileTags.values()) {
      if (fileTag.key === tagKey) {
        fileTag.value = tagValue;
        // this.appState.unsavedChanges = true;
        return;
      }
    }

    this.fileTags.set(++ParsedFile.TAG_COUNTER, {key: tagKey, value: tagValue});
  }

  removeFileTag(tagKey: string): void {
    for (const [entryIndex, fileTag] of this.fileTags.entries()) {
      if (fileTag.key === tagKey) {
        this.fileTags.delete(entryIndex);
        // this.appState.unsavedChanges = true;
        return;
      }
    }
  }

  renameFileTagKey(oldTagKey: string, newTagKey: string): void {
    if (oldTagKey === newTagKey) {
      return;
    }
    if (this.hasFileTag(newTagKey)) {
      throw new Error(`Cannot rename tag ${JSON.stringify(oldTagKey)} to ${JSON.stringify(newTagKey)} because the new tag key already exists`);
    }

    for (const fileTag of this.fileTags.values()) {
      if (fileTag.key === oldTagKey) {
        fileTag.key = newTagKey;
        // this.appState.unsavedChanges = true;
        return;
      }
    }

    throw new Error(`Could not find tag with key ${JSON.stringify(oldTagKey)} on file ${JSON.stringify(this.meta.name)}`);
  }

  createFileTag(): void {
    this.fileTags.set(++ParsedFile.TAG_COUNTER, {key: '', value: ''});
  }

  hasFileTag(tagKey: string): boolean {
    return Array
      .from(this.fileTags.values())
      .some(fileTag => fileTag.key === tagKey);
  }

  /* Stream Tags */

  getStreamTagValue(streamIndex: number, tagKey: string): string | null {
    for (const streamTag of this.streamTags.get(streamIndex)!.values()) {
      if (streamTag.key === tagKey) {
        return streamTag.value;
      }
    }
    return null;
  }

  setStreamTagValue(streamIndex: number, tagKey: string, tagValue: string): void {
    for (const streamTag of this.streamTags.get(streamIndex)!.values()) {
      if (streamTag.key === tagKey) {
        streamTag.value = tagValue;
        // this.appState.unsavedChanges = true;
        return;
      }
    }

    this.streamTags.get(streamIndex)!.set(++ParsedFile.TAG_COUNTER, {key: tagKey, value: tagValue});
  }

  removeStreamTag(streamIndex: number, tagKey: string): void {
    for (const [entryIndex, streamTag] of this.streamTags.get(streamIndex)!.entries()) {
      if (streamTag.key === tagKey) {
        this.streamTags.get(streamIndex)!.delete(entryIndex);
        // this.appState.unsavedChanges = true;
        return;
      }
    }
  }

  renameStreamTagKey(streamIndex: number, oldTagKey: string, newTagKey: string): void {
    if (oldTagKey === newTagKey) {
      return;
    }
    if (this.hasStreamTag(streamIndex, newTagKey)) {
      throw new Error(`Cannot rename tag ${JSON.stringify(oldTagKey)} to ${JSON.stringify(newTagKey)} because the new tag key already exists`);
    }

    for (const streamTag of this.streamTags.get(streamIndex)!.values()) {
      if (streamTag.key === oldTagKey) {
        streamTag.key = newTagKey;
        // this.appState.unsavedChanges = true;
        return;
      }
    }

    throw new Error(`Could not find tag with key ${JSON.stringify(oldTagKey)} on stream ${JSON.stringify(streamIndex)} of file ${JSON.stringify(this.meta.name)}`);
  }

  createStreamTag(streamIndex: number): void {
    this.streamTags.get(streamIndex)!.set(++ParsedFile.TAG_COUNTER, {key: '', value: ''});
  }

  hasStreamTag(streamIndex: number, tagKey: string): boolean {
    return Array
      .from(this.streamTags.get(streamIndex)!.values())
      .some(streamTag => streamTag.key === tagKey);
  }

  /* Misc */

  applyFromApiResponse(apiResponse: WriteVideoTagsApiResponse): void {
    if (this.meta.filePath !== apiResponse.newVideoAnalysis.filePath) {
      throw new Error(`Cannot apply API response to file ${JSON.stringify(this.meta.filePath)} because the file path does not match the api's ${JSON.stringify(apiResponse.newVideoAnalysis.filePath)}`);
    }

    (this.meta as any).formatNameLong = apiResponse.newVideoAnalysis.formatNameLong;
    (this.meta as any).probeScore = apiResponse.newVideoAnalysis.probeScore;
    (this.meta as any).duration = apiResponse.newVideoAnalysis.duration;

    this.fileTags.clear();
    for (const tagKey in apiResponse.newVideoAnalysis.tags) {
      if (!apiResponse.newVideoAnalysis.tags.hasOwnProperty(tagKey)) {
        continue;
      }
      this.fileTags.set(++ParsedFile.TAG_COUNTER, {key: tagKey, value: apiResponse.newVideoAnalysis.tags[tagKey]});
    }

    this.streamTags.clear();
    for (const stream of apiResponse.newVideoAnalysis.streams) {
      const streamTagsForStream = new Map<number, ParsedTag>();
      for (const tagKey in stream.tags) {
        if (!stream.tags.hasOwnProperty(tagKey)) {
          continue;
        }
        streamTagsForStream.set(++ParsedFile.TAG_COUNTER, {key: tagKey, value: stream.tags[tagKey]});
      }
      this.streamTags.set(stream.index, streamTagsForStream);
    }

    // this.appState.unsavedChanges = false;
  }

  static fromApiResponse(apiResponse: VideoAnalysisResult): ParsedFile {
    const fileTags = new Map<number, ParsedTag>();
    for (const tagKey in apiResponse.tags) {
      if (!apiResponse.tags.hasOwnProperty(tagKey)) {
        continue;
      }

      const tagValue = apiResponse.tags[tagKey] as string;
      fileTags.set(++this.TAG_COUNTER, {key: tagKey, value: tagValue});
    }

    const streamTags = new Map<number, Map<number, ParsedTag>>();
    for (const stream of apiResponse.streams) {
      const streamTagsForStream = new Map<number, ParsedTag>();
      for (const tagKey in stream.tags) {
        if (!stream.tags.hasOwnProperty(tagKey)) {
          continue;
        }

        const tagValue = stream.tags[tagKey] as string;
        streamTagsForStream.set(++this.TAG_COUNTER, {key: tagKey, value: tagValue});
      }
      streamTags.set(stream.index, streamTagsForStream);
    }

    return new ParsedFile({
        filePath: apiResponse.filePath,
        name: apiResponse.fileName,
        formatNameLong: apiResponse.formatNameLong,
        probeScore: apiResponse.probeScore,
        duration: apiResponse.duration
      },
      fileTags,
      streamTags);
  }
}
