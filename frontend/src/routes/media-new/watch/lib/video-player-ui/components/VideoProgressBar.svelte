<script lang="ts">
  import {onMount} from 'svelte';
  import type VideoPlayer from '../../client-side/VideoPlayer.svelte';

  const {videoPlayer}: { videoPlayer: VideoPlayer } = $props();

  let seekHandleRef: HTMLDivElement;
  let progressBarContainerRef: HTMLDivElement;

  let activateSeekPreview = $state(false);
  let seekPreviewLeftPosition = $state(0);
  let seekTimePosition = $state(0);

  let usingSeekHandle = $state(false);
  let currentSeekPercentage = $state(0);

  const showSeekPreview = $derived(activateSeekPreview || usingSeekHandle);
  const watchProgressPercentage = $derived(toFixedPrecision((videoPlayer.$currentTime / videoPlayer.$duration) * 100));
  const localBufferedPercentage = $derived(toFixedPrecision(((videoPlayer.$localBufferedRangeToDisplay?.end ?? 0) / videoPlayer.$duration) * 100));
  const remoteBufferedPercentage = $derived(toFixedPrecision(((videoPlayer.$remoteBufferedRange?.end ?? 0) / videoPlayer.$duration) * 100));
  const displayedPercentage = $derived(usingSeekHandle ? currentSeekPercentage : watchProgressPercentage);

  function formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  function toFixedPrecision(value: number): number {
    return (value * 1e2) / 1e2;
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
    let wasPlayingBeforeSeek = false;
    let lastSeekTime = 0;
    let usingSeekHandle = false;

    const preventSelection = (e: Event) => {
      if (e.preventDefault) {
        e.preventDefault();
      }
    };

    const startSeeking = () => {
      document.body.classList.add('seeking');
      seekHandleRef.classList.add('seeking');
      progressBarContainerRef.classList.add('seeking');
    };

    const stopSeeking = () => {
      document.body.classList.remove('seeking');
      seekHandleRef.classList.remove('seeking');
      progressBarContainerRef.classList.remove('seeking');
    };

    const handleSeekMove = (clientX: number) => {
      const rect = progressBarContainerRef.getBoundingClientRect();
      const position = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const percentage = position / rect.width;

      currentSeekPercentage = percentage * 100;
      seekPreviewLeftPosition = position;
      seekTimePosition = videoPlayer.$duration * percentage;
      lastSeekTime = seekTimePosition;

      activateSeekPreview = true;

      requestAnimationFrame(() => {
        videoPlayer.fastSeek(seekTimePosition);
      });
    };

    const handleSeekStart = (clientX: number) => {
      wasPlayingBeforeSeek = videoPlayer.$isPlaying;
      usingSeekHandle = true;
      videoPlayer.pause();
      document.addEventListener('selectstart', preventSelection);
      startSeeking();

      handleSeekMove(clientX);
    };

    const handleSeekEnd = () => {
      if (!usingSeekHandle) {
        return;
      }

      usingSeekHandle = false;
      document.removeEventListener('selectstart', preventSelection);
      stopSeeking();
      activateSeekPreview = false;

      videoPlayer.seek(lastSeekTime);
      if (wasPlayingBeforeSeek) {
        videoPlayer.play();
      }
    };

    seekHandleRef.addEventListener('mousedown', (event) => {
      handleSeekStart(event.clientX);
    }, {passive: false});

    progressBarContainerRef.addEventListener('mousedown', (event) => {
      handleSeekStart(event.clientX);
    }, {passive: false});

    const handleMouseMove = (e: MouseEvent) => {
      if (!usingSeekHandle) return;
      handleSeekMove(e.clientX);
    };

    document.addEventListener('mousemove', handleMouseMove, {passive: true});

    document.addEventListener('mouseup', handleSeekEnd, {passive: true});

    seekHandleRef.addEventListener('touchstart', (event) => {
      handleSeekStart(event.touches[0].clientX);
    }, {passive: false});

    progressBarContainerRef.addEventListener('touchstart', (event) => {
      handleSeekStart(event.touches[0].clientX);
    }, {passive: false});

    const handleTouchMove = (e: TouchEvent) => {
      if (!usingSeekHandle) return;
      handleSeekMove(e.touches[0].clientX);
    };

    document.addEventListener('touchmove', handleTouchMove, {passive: true});

    document.addEventListener('touchend', handleSeekEnd, {passive: true});
    document.addEventListener('touchcancel', handleSeekEnd, {passive: true});

    progressBarContainerRef.addEventListener('mousemove', (event) => {
      if (!usingSeekHandle) {
        handleSeekPreview(event.clientX);
      }
    }, {passive: true});

    progressBarContainerRef.addEventListener('mouseleave', () => {
      if (!usingSeekHandle) {
        activateSeekPreview = false;
      }
    }, {passive: true});

    progressBarContainerRef.addEventListener('touchmove', (event) => {
      if (!usingSeekHandle) {
        handleSeekPreview(event.touches[0].clientX);
      }
    }, {passive: true});

    progressBarContainerRef.addEventListener('touchend', () => {
      if (!usingSeekHandle) {
        activateSeekPreview = false;
      }
    }, {passive: true});

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleSeekEnd);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleSeekEnd);
      document.removeEventListener('touchcancel', handleSeekEnd);
      document.removeEventListener('selectstart', preventSelection);
    };
  });
</script>

<div class="seek-row">
  <span class="timestamp">{formatTime(videoPlayer.$currentTime)}</span>
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <div
    bind:this={progressBarContainerRef}
    class="progress-bar-container"
    role="slider"
    aria-label="Video progress"
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow={watchProgressPercentage}
  >
    <div class="progress-bar total"></div>
    <div class="progress-bar remote-buffered" style:width="{remoteBufferedPercentage}%"></div>
    <div class="progress-bar local-buffered" style:width="{localBufferedPercentage}%"></div>
    <div class="progress-bar watched" style:width="{displayedPercentage}%"></div>
    <div class="seek-handle" bind:this={seekHandleRef} style:left="{displayedPercentage}%"></div>

    <div class="seek-preview"
         style:display="{showSeekPreview ? 'block' : 'none'}"
         style:left="{seekPreviewLeftPosition}px"
    >
      <img src="example.png" alt="Preview" class="seek-preview-thumbnail">
      <div class="seek-preview-time">{formatTime(seekTimePosition)}</div>
    </div>
  </div>
  <span class="timestamp">{formatTime(videoPlayer.$duration)}</span>
</div>

<style>
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

  .progress-bar {
    position:      absolute;
    height:        5px;
    top:           50%;
    transform:     translateY(-50%);
    left:          0;
    border-radius: 2px;
  }

  .progress-bar.total {
    width:            100%;
    background-color: rgba(255, 255, 255, 0.2);
  }

  .progress-bar.remote-buffered {
    background-color: rgba(128, 128, 255, 0.4);
  }

  .progress-bar.local-buffered {
    background-color: rgba(255, 255, 255, 0.6);
  }

  .progress-bar.watched {
    background-color: #ff3e3e;
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

  :global(.seeking) {
    cursor: grabbing !important;
  }

  :global(.seek-handle.seeking) {
    cursor: grabbing;
  }

  .progress-bar-container:hover .seek-handle {
    transform: translate(-50%, -50%) scale(1.25);
  }

  .seek-preview {
    position:         absolute;
    bottom:           25px;
    transform:        translateX(-50%);
    background-color: rgba(0, 0, 0, 0.9);
    border-radius:    4px;
    padding:          4px;
    pointer-events:   none;
    z-index:          1000;
  }

  .seek-preview-thumbnail {
    width:         160px;
    height:        90px;
    object-fit:    cover;
    border-radius: 2px;
    display:       block;
  }

  .seek-preview-time {
    color:       white;
    text-align:  center;
    font-family: monospace;
    font-size:   0.9rem;
    margin-top:  4px;
  }
</style>
