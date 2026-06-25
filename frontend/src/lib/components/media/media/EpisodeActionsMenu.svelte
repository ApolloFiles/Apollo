<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import { getClientSideRpcClient } from '$lib/oRPCClientSide';

  let { libraryId, mediaId, mediaItemId, durationInSeconds, watchProgress }: {
    libraryId: string,
    mediaId: string,
    mediaItemId: string,
    durationInSeconds: number,
    watchProgress: {
                     inSeconds: number,
                     asPercentage: number,
                   } | null,
  } = $props();

  // Mirror ContinueWatchingProvider.FULLY_WATCHED_THRESHOLD_IN_SEC on the backend.
  const FULLY_WATCHED_THRESHOLD_IN_SEC = 120;

  let isBusy = $state(false);

  let isFullyWatched = $derived(watchProgress != null && (durationInSeconds - watchProgress.inSeconds) <= FULLY_WATCHED_THRESHOLD_IN_SEC);
  let canMarkWatched = $derived(!isFullyWatched);
  let canRemoveProgress = $derived(watchProgress != null);

  async function markWatched(): Promise<void> {
    if (isBusy || !canMarkWatched) {
      return;
    }

    isBusy = true;
    try {
      await getClientSideRpcClient().media.markWatched({ libraryId, mediaId, mediaItemId });
      await invalidateAll();
    } finally {
      isBusy = false;
    }
  }

  async function removeWatchProgress(): Promise<void> {
    if (isBusy || !canRemoveProgress) {
      return;
    }

    isBusy = true;
    try {
      await getClientSideRpcClient().media.removeWatchProgress({ libraryId, mediaId, mediaItemId });
      await invalidateAll();
    } finally {
      isBusy = false;
    }
  }
</script>

<div class="dropdown episode-actions">
  <button
    class="btn btn-sm episode-actions-toggle dropdown-toggle no-caret"
    data-bs-toggle="dropdown"
    aria-expanded="false"
    aria-label="Episode actions"
    type="button"
    disabled={isBusy}
  >
    <TablerIcon icon="dots-vertical" />
  </button>
  <ul class="dropdown-menu dropdown-menu-end dropdown-menu-dark">
    <li>
      <button type="button" class="dropdown-item" disabled={!canMarkWatched} onclick={markWatched}>
        <TablerIcon icon="check" class="me-2" />
        Mark as watched
      </button>
    </li>
    <li>
      <button type="button" class="dropdown-item" disabled={!canRemoveProgress} onclick={removeWatchProgress}>
        <TablerIcon icon="eraser" class="me-2" />
        Remove watch progress
      </button>
    </li>
  </ul>
</div>

<style>
  .episode-actions-toggle {
    color:         var(--text-secondary, #adb5bd);
    border:        none;
    background:    transparent;
    line-height:   1;
    border-radius: 50%;
  }

  .episode-actions-toggle:hover,
  .episode-actions-toggle:focus {
    color:            var(--text-primary, #fff);
    background-color: var(--hover-bg, rgba(255, 255, 255, 0.1));
  }

  .no-caret::after {
    display: none !important;
  }
</style>
