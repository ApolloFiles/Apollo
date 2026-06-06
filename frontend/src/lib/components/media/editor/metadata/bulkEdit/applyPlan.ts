import type { BulkEditPlan, MutableFile } from './types.js';

/**
 * Applies a {@link BulkEditPlan} to the real file data, locally (the existing save flow persists it).
 *
 * The plan is the same structure rendered by the preview, so what is applied is exactly what was
 * shown. Each change maps to a thin {@link MutableFile} / TagCollection setter — no operation logic
 * lives here, guaranteeing the preview and apply cannot diverge.
 *
 * IMPORTANT: pass a plan that was computed from these very same files immediately beforehand, so the
 * stream identifiers and reorder sets are consistent with the current state.
 */
export function applyBulkEditPlan(files: ReadonlyArray<MutableFile>, plan: BulkEditPlan): void {
  const fileByIdentifier = new Map(files.map((file) => [file.identifier, file]));

  // 1. Tag and disposition changes (skip streams that will be deleted anyway).
  for (const change of plan.streamChanges) {
    if (change.willBeDeleted) {
      continue;
    }

    const file = fileByIdentifier.get(change.fileIdentifier);
    if (file == null) {
      continue;
    }

    const stream = file.streams.find((stream) => stream.identifier === change.streamIdentifier);
    if (stream == null) {
      continue;
    }

    for (const tagDelete of change.tagDeletes) {
      stream.tags.deleteAllByKeyCaseInsensitive(tagDelete.key);
    }
    for (const tagWrite of change.tagWrites) {
      stream.tags.writeTagCaseInsensitive(tagWrite.key, tagWrite.value);
    }
    for (const dispositionChange of change.dispositionChanges) {
      file.setDisposition(change.streamIdentifier, dispositionChange.flag, dispositionChange.to);
    }
  }

  // 2. Deletions (before reorders, so the surviving set matches each reorder's identifier list).
  for (const change of plan.streamChanges) {
    if (!change.willBeDeleted) {
      continue;
    }
    fileByIdentifier.get(change.fileIdentifier)?.deleteStream(change.streamIdentifier);
  }

  // 3. Reorders.
  for (const reorder of plan.fileReorders) {
    fileByIdentifier.get(reorder.fileIdentifier)?.reorderStreams(reorder.orderedStreamIdentifiers);
  }
}
