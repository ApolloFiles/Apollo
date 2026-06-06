export type StreamType = 'video' | 'audio' | 'subtitle' | 'attachment' | 'misc';

// === Stream selection (filters) ===

export type Condition =
  | { uid: number, kind: 'streamType', streamType: StreamType }
  | { uid: number, kind: 'tag', key: string, value: string };

// === Modification operations (applied top to bottom) ===

export type Operation =
  | { uid: number, kind: 'tagDelete', key: string }
  | { uid: number, kind: 'tagWrite', key: string, value: string }
  | { uid: number, kind: 'dispositionUnsetAll' }
  | { uid: number, kind: 'dispositionSet', flag: string, value: boolean }
  | { uid: number, kind: 'streamReorder', position: number }
  | { uid: number, kind: 'streamDelete' };

export type OperationKind = Operation['kind'];

// === Structural views of the file/stream/tag data (so this module stays decoupled from FileData) ===

export interface TagView {
  readonly key: string,
  readonly value: string,
}

export interface StreamView {
  readonly identifier: number,
  readonly type: StreamType,
  readonly streamContextText: string,
  readonly tags: { readonly tags: ReadonlyArray<TagView> },
  readonly disposition: Readonly<Record<string, boolean>>,
}

export interface FileView {
  readonly identifier: string,
  readonly displayName: string,
  readonly streams: ReadonlyArray<StreamView>,
}

// === Mutation surface used by applyPlan (satisfied structurally by FileData / TagCollection) ===

export interface MutableTagCollection {
  writeTagCaseInsensitive(key: string, value: string): void,
  deleteAllByKeyCaseInsensitive(key: string): void,
}

export interface MutableStream {
  readonly identifier: number,
  readonly tags: MutableTagCollection,
}

export interface MutableFile {
  readonly identifier: string,
  readonly streams: ReadonlyArray<MutableStream>,
  setDisposition(streamIdentifier: number, dispositionKey: string, value: boolean): void,
  deleteStream(identifier: number): void,
  reorderStreams(orderedIdentifiers: number[]): void,
}

/** A file that can be both read (for planning) and mutated (for applying). FileData satisfies this. */
export type EditableFile = FileView & MutableFile;

// === Plan (the shared, drift-proof result consumed by both preview and apply) ===

export type TagWriteChange = { key: string, value: string, previousValue: string | null };
export type TagDeleteChange = { key: string, previousValue: string | null };
export type DispositionChange = { flag: string, from: boolean, to: boolean };

export type StreamChange = {
  fileIdentifier: string,
  fileDisplayName: string,
  streamIdentifier: number,
  streamType: StreamType,
  streamContextText: string,
  tagWrites: TagWriteChange[],
  tagDeletes: TagDeleteChange[],
  dispositionChanges: DispositionChange[],
  willBeDeleted: boolean,
};

export type FileReorder = {
  fileIdentifier: string,
  fileDisplayName: string,
  /** Final order (top to bottom) of the file's surviving (non-deleted) stream identifiers. */
  orderedStreamIdentifiers: number[],
};

export type MatchedStreamRef = {
  fileIdentifier: string,
  fileDisplayName: string,
  streamIdentifier: number,
  streamType: StreamType,
  streamContextText: string,
};

export type BulkEditPlan = {
  hasConditions: boolean,
  matchedStreams: MatchedStreamRef[],
  totalStreamCount: number,
  matchedFileCount: number,
  /** True when every matched file contributes exactly one stream (and at least one stream matched). */
  oneStreamPerFile: boolean,
  /** Only contains streams that actually change (dry-run semantics). */
  streamChanges: StreamChange[],
  fileReorders: FileReorder[],
  hasAnyChange: boolean,
};
