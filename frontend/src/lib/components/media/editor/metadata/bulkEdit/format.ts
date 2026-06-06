import type { MatchedStreamRef } from './types.js';

/** Caps a filename to {@link max} characters, replacing the cut-off tail with an ellipsis. */
export function truncateFilename(name: string, max = 20): string {
  if (name.length <= max) {
    return name;
  }
  return `${name.slice(0, Math.max(0, max - 1))}…`;
}

/** e.g. `#2 (video) in S01E01 – Abc….mkv` */
export function describeMatchedStream(ref: MatchedStreamRef, maxFilenameLength = 20): string {
  return `#${ref.streamIdentifier} (${ref.streamType}) in ${truncateFilename(ref.fileDisplayName, maxFilenameLength)}`;
}

/** Multi-line description of all matched streams, suitable for a `title` attribute. */
export function describeMatchedStreams(refs: ReadonlyArray<MatchedStreamRef>, maxFilenameLength = 20): string {
  return refs.map((ref) => describeMatchedStream(ref, maxFilenameLength)).join('\n');
}
