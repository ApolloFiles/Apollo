import TagCollection from './TagCollection.svelte';

export type MetadataTag = { key: string, value: string };

export type FileMetadata = {
  tags: MetadataTag[],
}

export type StreamData = {
  identifier: number,
  type: 'video' | 'audio' | 'subtitle' | 'misc',
  order: number,

  streamContextText: string,

  tags: TagCollection,
  disposition: Record<string, boolean>,
}

export type FileDataFromBackend = {
  identifier: string,
  name: string,

  videoMeta: {
    file: {
      tags: MetadataTag[],
    },
    streams: {
      type: StreamData['type'],
      streamContextText: string,

      tags: MetadataTag[],
      disposition: Record<string, boolean>,
    }[],
  },
}

export default class FileData {
  public readonly globalTags: TagCollection;
  private readonly _streamsMarkedForDeletion: StreamData['identifier'][] = [];
  private readonly _streams: StreamData[] = $state([]);
  private _hasUnsavedChanges = $state(false);

  constructor(
    public readonly identifier: string,
    public readonly name: string,
    globalMetadata: FileMetadata,
    streams: StreamData[],
  ) {
    this.globalTags = new TagCollection(globalMetadata.tags);

    for (const stream of streams) {
      this._streams.push(stream);
    }

    this.sortTagsByKey();
  }

  get streams(): ReadonlyArray<StreamData> {
    return this._streams;
  }

  get streamsMarkedForDeletion(): ReadonlyArray<StreamData['identifier']> {
    return this._streamsMarkedForDeletion;
  }

  get hasUnsavedChanges(): boolean {
    return this._hasUnsavedChanges ||
      this.globalTags.hasUnsavedChanges ||
      this.streams.some(stream => stream.tags.hasUnsavedChanges);
  }

  sortTagsByKey(): void {
    this.globalTags.sortTagsByKey();
    for (const stream of this.streams) {
      stream.tags.sortTagsByKey();
    }
  }

  updateStreamOrderOneUp(identifier: StreamData['identifier']): void {
    const indexInArray = this._streams.findIndex(stream => stream.identifier === identifier);
    if (indexInArray === -1) {
      throw new Error(`Stream with identifier ${identifier} not found`);
    }

    if (indexInArray === 0) {
      // Already at the top
      return;
    }

    const currentStream = this._streams[indexInArray];
    const streamAbove = this._streams[indexInArray - 1];

    // Swap their order values
    const tempOrder = currentStream.order;
    currentStream.order = streamAbove.order;
    streamAbove.order = tempOrder;

    this._hasUnsavedChanges = true;
    this.sortStreamsByOrder();
  }

  updateStreamOrderOneDown(identifier: StreamData['identifier']): void {
    const indexInArray = this._streams.findIndex(stream => stream.identifier === identifier);
    if (indexInArray === -1) {
      throw new Error(`Stream with identifier ${identifier} not found`);
    }

    if (indexInArray === this._streams.length - 1) {
      // Already at the bottom
      return;
    }

    const currentStream = this._streams[indexInArray];
    const streamBelow = this._streams[indexInArray + 1];

    // Swap their order values
    const tempOrder = currentStream.order;
    currentStream.order = streamBelow.order;
    streamBelow.order = tempOrder;

    this._hasUnsavedChanges = true;
    this.sortStreamsByOrder();
  }

  deleteStream(identifier: StreamData['identifier']): void {
    const indexInArray = this._streams.findIndex(stream => stream.identifier === identifier);
    if (indexInArray === -1) {
      throw new Error(`Stream with identifier ${identifier} not found`);
    }

    this._streamsMarkedForDeletion.push(identifier);
    this._streams.splice(indexInArray, 1);
    this._hasUnsavedChanges = true;
  }

  toggleDisposition(streamIdentifier: StreamData['identifier'], dispositionKey: string): void {
    const indexInArray = this._streams.findIndex(stream => stream.identifier === streamIdentifier);
    if (indexInArray === -1) {
      throw new Error(`Stream with identifier ${streamIdentifier} not found`);
    }

    const stream = this._streams[indexInArray];

    if (!(dispositionKey in stream.disposition)) {
      throw new Error(`Disposition key ${dispositionKey} not found`);
    }

    stream.disposition[dispositionKey] = !stream.disposition[dispositionKey];
    this._hasUnsavedChanges = true;
  }

  private sortStreamsByOrder(): void {
    this._streams.sort((a, b) => a.order - b.order);
  }

  static createMultipleFromBackendData(filesFromBackend: FileDataFromBackend[]): FileData[] {
    return filesFromBackend.map((file) => {
      return new FileData(
        file.identifier,
        file.name,
        file.videoMeta.file,
        file.videoMeta.streams.map((stream, index) => {
          const tags = new TagCollection(stream.tags);

          return {
            identifier: index,
            type: stream.type,
            order: index,

            streamContextText: stream.streamContextText,

            tags,
            disposition: stream.disposition,
          };
        }),
      );
    });
  }
}
