<script lang="ts">
  import { onMount } from 'svelte';
  import type VideoPlayer from '../client-side/VideoPlayer.svelte.js';
  import VideoContextMenu from './components/VideoContextMenu.svelte';
  import ControlsBottomBar from './layout/ControlsBottomBar.svelte';
  import ControlsTopBar from './layout/ControlsTopBar.svelte';

  let {
    videoPlayer,
    showCustomControls = true,
    episodeTitlePrefix,
    initiateMediaChange,
    autoPlayEnabled = $bindable(),
  }: {
    videoPlayer: VideoPlayer,
    showCustomControls: boolean,
    episodeTitlePrefix: string,
    initiateMediaChange: (mediaItemId: string, startOffset: number) => Promise<void>,
    autoPlayEnabled: boolean,
  } = $props();

  let videoContextMenuRef: VideoContextMenu;
  let playerControlsBottomRef: ControlsBottomBar | undefined = $state(undefined);
  let closeOtherMenusRef = $derived(() => playerControlsBottomRef?.closeAllMenus);

  const CONTROL_HIDE_DELAY_MS = 2000;
  const TOUCH_CONTROL_HIDE_DELAY_MS = 2200;
  const TOUCH_DOUBLE_TAP_WINDOW_MS = 300;
  const TOUCH_CLICK_SUPPRESSION_MS = 600;
  const DOUBLE_TAP_SEEK_SECONDS = 10;

  type TapZone = 'left' | 'center' | 'right';

  let controlsVisible = $state(true);
  let videoPlayerIsInFullscreen = $state(document.fullscreenElement != null);
  let isCoarsePointer = $state(false);
  let hideTimeout: number | undefined;
  let suppressClickUntil = 0;
  let lastTouchTapAt = 0;
  let lastTouchTapZone: TapZone | null = null;
  let mainElement: HTMLElement | null = null;

  function isSomeMenuOpen(): boolean {
    return (videoContextMenuRef?.isVisible() || playerControlsBottomRef?.isAnyMenuOpen()) ?? false;
  }

  function getTapZone(targetElement: HTMLVideoElement, clientX: number): TapZone {
    const rect = targetElement.getBoundingClientRect();
    if (rect.width <= 0) {
      return 'center';
    }

    const relativeX = (clientX - rect.left) / rect.width;
    if (relativeX <= (1 / 3)) {
      return 'left';
    }
    if (relativeX >= (2 / 3)) {
      return 'right';
    }
    return 'center';
  }

  function showControls(): void {
    controlsVisible = true;
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = undefined;
    }

    if (mainElement) {
      mainElement.style.cursor = '';
    }
  }

  function hideControls(): void {
    controlsVisible = false;
    if (mainElement && showCustomControls) {
      mainElement.style.cursor = 'none';
    }
  }

  function scheduleHide(delayMs = CONTROL_HIDE_DELAY_MS): void {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
    }
    hideTimeout = window.setTimeout(() => {
      if (!videoPlayer.$isPlaying || isSomeMenuOpen()) {
        return;
      }
      hideControls();
    }, delayMs);
  }

  function handleMouseMove(event: MouseEvent): void {
    if (!showCustomControls || isCoarsePointer) {
      return;
    }

    showControls();

    if (event.target instanceof HTMLElement) {
      const isHoveringControls = event.target.closest('.controls-overlay');
      if (!isHoveringControls) {
        scheduleHide();
      }
    }
  }

  function handleMouseLeave(): void {
    if (isCoarsePointer) {
      return;
    }

    if (videoPlayer.$isPlaying && !isSomeMenuOpen()) {
      hideControls();
    }
  }

  function handleVideoContainerTouchEnd(event: TouchEvent): void {
    if (!showCustomControls) {
      return;
    }
    if (!(event.target instanceof HTMLVideoElement)) {
      return;
    }
    if (isSomeMenuOpen()) {
      showControls();
      return;
    }

    suppressClickUntil = performance.now() + TOUCH_CLICK_SUPPRESSION_MS;
    showControls();

    const touchPoint = event.changedTouches[0];
    if (!touchPoint) {
      return;
    }

    const tapZone = getTapZone(event.target, touchPoint.clientX);
    const now = performance.now();
    const isDoubleTap = (now - lastTouchTapAt) <= TOUCH_DOUBLE_TAP_WINDOW_MS;
    const isSeekZone = tapZone === 'left' || tapZone === 'right';
    const sameTapZone = tapZone === lastTouchTapZone;

    if (isDoubleTap && isSeekZone && sameTapZone) {
      const seekOffset = tapZone === 'left' ? -DOUBLE_TAP_SEEK_SECONDS : DOUBLE_TAP_SEEK_SECONDS;
      videoPlayer.seek(videoPlayer.$currentTime + seekOffset, false, true);
      scheduleHide(TOUCH_CONTROL_HIDE_DELAY_MS);

      lastTouchTapAt = 0;
      lastTouchTapZone = null;
      return;
    }

    lastTouchTapAt = now;
    lastTouchTapZone = tapZone;

    if (videoPlayer.$isPlaying) {
      scheduleHide(TOUCH_CONTROL_HIDE_DELAY_MS);
    }
  }

  onMount(() => {
    const coarsePointerMediaQuery = window.matchMedia('(hover: none) and (pointer: coarse)');
    const updateIsCoarsePointer = (): void => {
      isCoarsePointer = coarsePointerMediaQuery.matches;
    };

    updateIsCoarsePointer();
    coarsePointerMediaQuery.addEventListener?.('change', updateIsCoarsePointer);

    mainElement = document.querySelector('main.watch-main');
    if (!mainElement) {
      coarsePointerMediaQuery.removeEventListener?.('change', updateIsCoarsePointer);
      return;
    }

    mainElement.addEventListener('mousemove', handleMouseMove);
    mainElement.addEventListener('mouseleave', handleMouseLeave, { passive: true });

    const handleFullscreenChange = () => {
      videoPlayerIsInFullscreen = document.fullscreenElement != null;
    };

    const handleVideoContainerClick = (event: MouseEvent) => {
      if (!showCustomControls) {
        return;
      }

      if (event.target instanceof HTMLElement && event.target.closest('.control-bar')) {
        return;
      }
      if (!(event.target instanceof HTMLVideoElement)) {
        return;
      }
      if (isSomeMenuOpen()) {
        return;
      }
      if (performance.now() < suppressClickUntil) {
        return;
      }

      if (isCoarsePointer) {
        showControls();
        if (videoPlayer.$isPlaying) {
          scheduleHide(TOUCH_CONTROL_HIDE_DELAY_MS);
        }
        return;
      }

      // TODO: add double-click support to toggle fullscreen

      if (videoPlayer.$isPlaying) {
        videoPlayer.pause(true);
        showControls();
      } else {
        videoPlayer.play(true);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!showCustomControls) {
        return;
      }

      const isTargetTextInput = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || (event.target instanceof HTMLElement && event.target.isContentEditable);
      const isSpecialKeyActive = event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.isComposing;
      if (isTargetTextInput || isSpecialKeyActive) {
        return;
      }

      switch (event.key) {
        case 'k':
          if (!event.repeat) {
            if (videoPlayer.$isPlaying) {
              videoPlayer.pause(true);
              showControls();
            } else {
              videoPlayer.play(true);
              scheduleHide();
            }
          }
          break;

        case 'm':
          if (!event.repeat) {
            videoPlayer.$muted = !videoPlayer.$muted;
            showControls();
            scheduleHide();
          }
          break;

        case 'j':
          videoPlayer.seek(videoPlayer.$currentTime - 5, false, true);
          showControls();
          scheduleHide();
          break;

        case 'l':
          videoPlayer.seek(videoPlayer.$currentTime + 5, false, true);
          showControls();
          scheduleHide();
          break;

        case 'f':
          playerControlsBottomRef?.toggleFullscreen();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown, { passive: true });
    const videoContainerElement = mainElement.querySelector<HTMLDivElement>('.video-container');
    if (!videoContainerElement) {
      coarsePointerMediaQuery.removeEventListener?.('change', updateIsCoarsePointer);
      return;
    }
    videoContainerElement.addEventListener('click', handleVideoContainerClick, { passive: true });
    videoContainerElement.addEventListener('touchend', handleVideoContainerTouchEnd, { passive: true });

    document.addEventListener('fullscreenchange', handleFullscreenChange, { passive: true });

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      coarsePointerMediaQuery.removeEventListener?.('change', updateIsCoarsePointer);

      if (hideTimeout) {
        clearTimeout(hideTimeout);
      }

      if (mainElement) {
        mainElement.removeEventListener('mousemove', handleMouseMove);
        mainElement.removeEventListener('mouseleave', handleMouseLeave);
        mainElement.style.cursor = '';

        const videoContainerElement = mainElement.querySelector<HTMLDivElement>('.video-container');
        videoContainerElement?.removeEventListener('click', handleVideoContainerClick);
        videoContainerElement?.removeEventListener('touchend', handleVideoContainerTouchEnd);
      }
    };
  });
</script>

<div class="video-player-ui-container" class:fullscreen={videoPlayerIsInFullscreen}>
  <VideoContextMenu
    bind:this={videoContextMenuRef}
    closeOtherMenus={closeOtherMenusRef} />
  {#if showCustomControls}
    <div
      class="controls-overlay"
      class:fade-out={!controlsVisible}
      onmouseenter={showControls}
      role="region"
      aria-label="Video player controls"
    >
      <ControlsTopBar
        bind:autoPlayEnabled={autoPlayEnabled}
        mediaMetadata={videoPlayer.mediaMetadata}
        episodeTitlePrefix={episodeTitlePrefix}
        initiateMediaChange={initiateMediaChange}
      />
      <ControlsBottomBar
        bind:this={playerControlsBottomRef}
        videoPlayer={videoPlayer}
      />
    </div>
  {/if}
</div>

<style>
  .video-player-ui-container {
    position:       absolute;
    top:            56px;
    left:           0;
    right:          0;
    bottom:         0;
    pointer-events: none;
  }

  .fullscreen {
    top: 0;
  }

  .controls-overlay {
    position:        absolute;
    top:             0;
    left:            0;
    right:           0;
    bottom:          0;
    background:      linear-gradient(
                       to bottom,
                       rgba(0, 0, 0, 1) 0%,
                       rgba(0, 0, 0, 0) 25%,
                       rgba(0, 0, 0, 0) 75%,
                       rgba(0, 0, 0, 1) 100%
                     );
    display:         flex;
    flex-direction:  column;
    justify-content: space-between;
    pointer-events:  none;
    opacity:         1;
    transition:      opacity 0.3s ease;
  }

  .controls-overlay.fade-out {
    opacity: 0;
  }

  .controls-overlay :global(> *) {
    pointer-events: auto;
  }
</style>
