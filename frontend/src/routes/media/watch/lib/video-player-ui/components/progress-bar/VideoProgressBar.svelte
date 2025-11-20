<script lang="ts">
  import { onMount } from 'svelte';
  import type VideoPlayer from '../../../client-side/VideoPlayer.svelte.js';
  import ProgressBars from './ProgressBars.svelte';
  import { initializeSeekHandler } from './seekHandler';
  import SeekPreview from './SeekPreview.svelte';

  const { videoPlayer }: { videoPlayer: VideoPlayer } = $props();

  let seekHandleRef: HTMLDivElement;
  let progressBarContainerRef: HTMLDivElement;

  let activateSeekPreview = $state(false);
  let seekPreviewLeftPosition = $state(0);
  let seekTimePosition = $state(0);
  let currentSeekPercentage = $state(0);
  let usingSeekHandle = $state(false);

  const showSeekPreview = $derived(activateSeekPreview || usingSeekHandle);
  const watchProgressPercentage = $derived(toFixedPrecision((videoPlayer.$currentTime / videoPlayer.$duration) * 100));
  const localBufferedPercentage = $derived(toFixedPrecision(((videoPlayer.$localBufferedRangeToDisplay?.end ?? 0) / videoPlayer.$duration) * 100));
  const remoteBufferedPercentage = $derived(toFixedPrecision(((videoPlayer.$remoteBufferedRange?.end ?? 0) / videoPlayer.$duration) * 100));
  const displayedPercentage = $derived(usingSeekHandle ? currentSeekPercentage : watchProgressPercentage);

  function toFixedPrecision(value: number): number {
    return (value * 1e2) / 1e2;
  }

  function formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  function handleSeekPreview(clientX: number): void {
    const rect = progressBarContainerRef.getBoundingClientRect();
    const position = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percentage = position / rect.width;

    activateSeekPreview = true;
    seekPreviewLeftPosition = position;
    seekTimePosition = videoPlayer.$duration * percentage;
  }

  onMount(() => {
    const cleanup = initializeSeekHandler({
      videoPlayer,
      progressBarContainer: progressBarContainerRef,
      seekHandle: seekHandleRef,
      onSeekMove: (position, percentage, time) => {
        currentSeekPercentage = percentage;
        seekPreviewLeftPosition = position;
        seekTimePosition = time;
        activateSeekPreview = true;
      },
      onSeekStart: () => {
        usingSeekHandle = true;
      },
      onSeekEnd: () => {
        usingSeekHandle = false;
        activateSeekPreview = false;
      },
    });

    progressBarContainerRef.addEventListener('mousemove', (event) => {
      if (!usingSeekHandle) {
        handleSeekPreview(event.clientX);
      }
    }, { passive: true });

    progressBarContainerRef.addEventListener('mouseleave', () => {
      if (!usingSeekHandle) {
        activateSeekPreview = false;
      }
    }, { passive: true });

    return cleanup;
  });
</script>

<div class="seek-row">
  <span class="timestamp">{formatTime(videoPlayer.$currentTime)}</span>

  <div
    bind:this={progressBarContainerRef}
    class="progress-bar-container"
    role="slider"
    aria-label="Video progress"
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow={watchProgressPercentage}
  >
    <ProgressBars
      {remoteBufferedPercentage}
      {localBufferedPercentage}
      {displayedPercentage}
    />

    <div
      class="seek-handle"
      bind:this={seekHandleRef}
      style:left="{displayedPercentage}%"
    ></div>

    <SeekPreview
      visible={showSeekPreview}
      position={seekPreviewLeftPosition}
      time={seekTimePosition}
      playerExtras={videoPlayer.playerExtras}
    />
  </div>

  <span class="timestamp">{formatTime(videoPlayer.$duration)}</span>
</div>

<style>
  :global(.seeking) {
    cursor: grabbing !important;
  }

  :global(.seek-handle.seeking) {
    cursor: grabbing;
  }

  .seek-row {
    display:     flex;
    align-items: center;
    gap:         15px;
    width:       100%;
    user-select: none;
  }

  .progress-bar-container {
    flex-grow:    1;
    position:     relative;
    cursor:       pointer;
    padding:      14px 0;
    user-select:  none;
    touch-action: none;
  }

  .timestamp {
    color:       white;
    font-family: monospace;
    font-size:   0.9rem;
    min-width:   45px;
  }

  .seek-handle {
    position:         absolute;
    width:            14px;
    height:           14px;
    background-color: #ff3e3e;
    border-radius:    50%;
    top:              50%;
    transform:        translate(-50%, -50%);
    cursor:           grab;
    transition:       transform 0.1s;
    user-select:      none;
    touch-action:     none;
  }

  .progress-bar-container:hover .seek-handle {
    transform: translate(-50%, -50%) scale(1.25);
  }
</style>
