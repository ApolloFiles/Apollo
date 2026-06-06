import type {
  BulkEditPlan,
  Condition,
  DispositionChange,
  FileReorder,
  FileView,
  MatchedStreamRef,
  Operation,
  StreamChange,
  StreamView,
  TagDeleteChange,
  TagWriteChange,
} from './types.js';

// === Internal simulation model (plain, mutable copies — never the real FileData) ===

type SimTag = { key: string, value: string };

type SimStream = {
  identifier: number,
  type: StreamView['type'],
  streamContextText: string,
  originalTags: SimTag[],
  tags: SimTag[],
  originalDisposition: Record<string, boolean>,
  disposition: Record<string, boolean>,
  matched: boolean,
  deleted: boolean,
};

type SimFile = {
  identifier: string,
  displayName: string,
  /** All streams, in original display order (used for per-stream changes). */
  streams: SimStream[],
  /** Current order of the surviving (non-deleted) streams; mutated by reorder/delete. */
  order: SimStream[],
};

/**
 * Computes the concrete set of changes that applying {@link operations} to the streams matched by
 * {@link conditions} would produce.
 *
 * This is the single source of truth shared by the preview and the apply step: it never mutates the
 * real {@link FileView} data, it simulates the operations on plain copies and then diffs the final
 * state against the original. Because both the preview and {@link applyBulkEditPlan} consume this
 * result, they cannot drift apart.
 */
export function computeBulkEditPlan(
  files: ReadonlyArray<FileView>,
  conditions: ReadonlyArray<Condition>,
  operations: ReadonlyArray<Operation>,
): BulkEditPlan {
  const simFiles = snapshot(files);

  // Freeze the matched set up front (against the original snapshot) so later delete/reorder
  // operations cannot change which streams are considered "selected".
  for (const file of simFiles) {
    for (const stream of file.streams) {
      stream.matched = matchesAllConditions(stream, conditions);
    }
  }

  for (const operation of operations) {
    applyOperationToSimulation(simFiles, operation);
  }

  return diff(simFiles, conditions.length > 0);
}

/** Union of disposition flag names across all streams (used to populate the "Set flag" dropdown). */
export function collectDispositionFlags(files: ReadonlyArray<FileView>): string[] {
  const flags = new Set<string>();
  for (const file of files) {
    for (const stream of file.streams) {
      for (const flag of Object.keys(stream.disposition)) {
        flags.add(flag);
      }
    }
  }
  return Array.from(flags).sort((a, b) => a.localeCompare(b, 'en'));
}

function snapshot(files: ReadonlyArray<FileView>): SimFile[] {
  return files.map((file) => {
    const streams: SimStream[] = file.streams.map((stream) => ({
      identifier: stream.identifier,
      type: stream.type,
      streamContextText: stream.streamContextText,
      originalTags: copyTags(stream),
      tags: copyTags(stream),
      originalDisposition: { ...stream.disposition },
      disposition: { ...stream.disposition },
      matched: false,
      deleted: false,
    }));

    return {
      identifier: file.identifier,
      displayName: file.displayName,
      streams,
      order: streams.slice(),
    };
  });
}

function copyTags(stream: StreamView): SimTag[] {
  return stream.tags.tags.map((tag) => ({ key: tag.key, value: tag.value }));
}

function matchesAllConditions(stream: SimStream, conditions: ReadonlyArray<Condition>): boolean {
  return conditions.every((condition) => {
    if (condition.kind === 'streamType') {
      return stream.type === condition.streamType;
    }

    // 'tag' — case-insensitive match on both key and value, evaluated against the ORIGINAL tags.
    const key = condition.key.toLowerCase();
    const value = condition.value.toLowerCase();
    return stream.originalTags.some(
      (tag) => tag.key.toLowerCase() === key && tag.value.toLowerCase() === value,
    );
  });
}

function applyOperationToSimulation(simFiles: SimFile[], operation: Operation): void {
  switch (operation.kind) {
    case 'tagDelete': {
      const key = operation.key.trim();
      if (key === '') {
        return;
      }
      const lowerKey = key.toLowerCase();
      forEachMatchedActiveStream(simFiles, (stream) => {
        stream.tags = stream.tags.filter((tag) => tag.key.toLowerCase() !== lowerKey);
      });
      return;
    }

    case 'tagWrite': {
      const key = operation.key.trim();
      if (key === '') {
        return;
      }
      const lowerKey = key.toLowerCase();
      forEachMatchedActiveStream(simFiles, (stream) => {
        const matches = stream.tags.filter((tag) => tag.key.toLowerCase() === lowerKey);
        if (matches.length === 0) {
          stream.tags.push({ key, value: operation.value });
          return;
        }

        // Update the first match (keeping its existing key casing), drop any duplicates.
        matches[0].value = operation.value;
        const duplicates = new Set(matches.slice(1));
        if (duplicates.size > 0) {
          stream.tags = stream.tags.filter((tag) => !duplicates.has(tag));
        }
      });
      return;
    }

    case 'dispositionUnsetAll': {
      forEachMatchedActiveStream(simFiles, (stream) => {
        for (const flag of Object.keys(stream.disposition)) {
          stream.disposition[flag] = false;
        }
      });
      return;
    }

    case 'dispositionSet': {
      forEachMatchedActiveStream(simFiles, (stream) => {
        if (operation.flag in stream.disposition) {
          stream.disposition[operation.flag] = operation.value;
        }
      });
      return;
    }

    case 'streamReorder': {
      for (const file of simFiles) {
        const matched = file.order.filter((stream) => stream.matched);
        if (matched.length === 0) {
          continue;
        }

        // Move each matched stream (processed in current file order) toward the target position,
        // clamped to the bounds of the surviving streams.
        for (const stream of matched) {
          const from = file.order.indexOf(stream);
          if (from === -1) {
            continue;
          }
          const to = clamp(operation.position, 0, file.order.length - 1);
          file.order.splice(from, 1);
          file.order.splice(to, 0, stream);
        }
      }
      return;
    }

    case 'streamDelete': {
      forEachMatchedActiveStream(simFiles, (stream, file) => {
        stream.deleted = true;
        const index = file.order.indexOf(stream);
        if (index !== -1) {
          file.order.splice(index, 1);
        }
      });
      return;
    }
  }
}

function forEachMatchedActiveStream(
  simFiles: SimFile[],
  fn: (stream: SimStream, file: SimFile) => void,
): void {
  for (const file of simFiles) {
    // Snapshot the list first: streamDelete mutates file.order while we iterate.
    for (const stream of file.streams) {
      if (stream.matched && !stream.deleted) {
        fn(stream, file);
      }
    }
  }
}

function diff(simFiles: SimFile[], hasConditions: boolean): BulkEditPlan {
  const matchedStreams: MatchedStreamRef[] = [];
  const streamChanges: StreamChange[] = [];
  const fileReorders: FileReorder[] = [];
  const matchedFiles = new Set<string>();
  const matchCountPerFile = new Map<string, number>();

  for (const file of simFiles) {
    for (const stream of file.streams) {
      if (!stream.matched) {
        continue;
      }

      matchedStreams.push({
        fileIdentifier: file.identifier,
        fileDisplayName: file.displayName,
        streamIdentifier: stream.identifier,
        streamType: stream.type,
        streamContextText: stream.streamContextText,
      });
      matchedFiles.add(file.identifier);
      matchCountPerFile.set(file.identifier, (matchCountPerFile.get(file.identifier) ?? 0) + 1);

      const base = {
        fileIdentifier: file.identifier,
        fileDisplayName: file.displayName,
        streamIdentifier: stream.identifier,
        streamType: stream.type,
        streamContextText: stream.streamContextText,
      };

      if (stream.deleted) {
        streamChanges.push({
          ...base,
          tagWrites: [],
          tagDeletes: [],
          dispositionChanges: [],
          willBeDeleted: true,
        });
        continue;
      }

      const { tagWrites, tagDeletes } = diffTags(stream.originalTags, stream.tags);
      const dispositionChanges = diffDisposition(stream.originalDisposition, stream.disposition);

      if (tagWrites.length > 0 || tagDeletes.length > 0 || dispositionChanges.length > 0) {
        streamChanges.push({
          ...base,
          tagWrites,
          tagDeletes,
          dispositionChanges,
          willBeDeleted: false,
        });
      }
    }

    const finalOrder = file.order.map((stream) => stream.identifier);
    const originalSurvivingOrder = file.streams
      .filter((stream) => !stream.deleted)
      .map((stream) => stream.identifier);
    if (!arraysEqual(finalOrder, originalSurvivingOrder)) {
      fileReorders.push({
        fileIdentifier: file.identifier,
        fileDisplayName: file.displayName,
        orderedStreamIdentifiers: finalOrder,
      });
    }
  }

  const totalStreamCount = matchedStreams.length;
  const matchedFileCount = matchedFiles.size;
  const oneStreamPerFile =
    totalStreamCount > 0 &&
    Array.from(matchCountPerFile.values()).every((count) => count === 1);

  return {
    hasConditions,
    matchedStreams,
    totalStreamCount,
    matchedFileCount,
    oneStreamPerFile,
    streamChanges,
    fileReorders,
    hasAnyChange: streamChanges.length > 0 || fileReorders.length > 0,
  };
}

function diffTags(
  original: SimTag[],
  final: SimTag[],
): { tagWrites: TagWriteChange[], tagDeletes: TagDeleteChange[] } {
  const tagWrites: TagWriteChange[] = [];
  const tagDeletes: TagDeleteChange[] = [];

  const originalByKey = groupByLowerKey(original);
  const finalByKey = groupByLowerKey(final);
  const lowerKeys = new Set([...originalByKey.keys(), ...finalByKey.keys()]);

  for (const lowerKey of lowerKeys) {
    const originalTags = originalByKey.get(lowerKey) ?? [];
    const finalTags = finalByKey.get(lowerKey) ?? [];

    if (sameValueMultiset(originalTags, finalTags)) {
      continue;
    }

    const previousValue = originalTags.length === 1 ? originalTags[0].value : null;

    if (finalTags.length === 0) {
      // Use the original key casing for display.
      tagDeletes.push({ key: originalTags[0].key, previousValue });
    } else {
      // A touched key always collapses to a single entry (writes dedupe, deletes remove).
      tagWrites.push({ key: finalTags[0].key, value: finalTags[0].value, previousValue });
    }
  }

  return { tagWrites, tagDeletes };
}

function diffDisposition(
  original: Record<string, boolean>,
  final: Record<string, boolean>,
): DispositionChange[] {
  const changes: DispositionChange[] = [];
  for (const flag of Object.keys(original)) {
    if (final[flag] !== original[flag]) {
      changes.push({ flag, from: original[flag], to: final[flag] });
    }
  }
  return changes;
}

function groupByLowerKey(tags: SimTag[]): Map<string, SimTag[]> {
  const grouped = new Map<string, SimTag[]>();
  for (const tag of tags) {
    const lowerKey = tag.key.toLowerCase();
    const existing = grouped.get(lowerKey);
    if (existing != null) {
      existing.push(tag);
    } else {
      grouped.set(lowerKey, [tag]);
    }
  }
  return grouped;
}

function sameValueMultiset(a: SimTag[], b: SimTag[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const sortedA = a.map((tag) => tag.value).sort();
  const sortedB = b.map((tag) => tag.value).sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}

function arraysEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
