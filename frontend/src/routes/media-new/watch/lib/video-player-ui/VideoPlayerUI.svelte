<script lang="ts">
  import { onMount } from 'svelte';
  import type VideoPlayer from '../client-side/VideoPlayer.svelte';
  import VideoContextMenu from './components/VideoContextMenu.svelte';
  import ControlsBottomBar from './layout/ControlsBottomBar.svelte';
  import ControlsTopBar from './layout/ControlsTopBar.svelte';

  const { videoPlayer, showCustomControls = true, episodeTitlePrefix }: {
    videoPlayer: VideoPlayer,
    showCustomControls: boolean,
    episodeTitlePrefix: string
  } = $props();

  let videoContextMenuRef: VideoContextMenu;
  let playerControlsBottomRef: ControlsBottomBar | undefined = $state(undefined);
  let closeOtherMenusRef = $derived(() => playerControlsBottomRef?.closeAllMenus);

  let controlsVisible = $state(true);
  let videoPlayerIsInFullscreen = $state(document.fullscreenElement != null);
  let hideTimeout: number | undefined;
  let mainElement: HTMLElement | null = null;

  function isSomeMenuOpen(): boolean {
    return (videoContextMenuRef?.isVisible() || playerControlsBottomRef?.isAnyMenuOpen()) ?? false;
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

  function scheduleHide(): void {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
    }
    hideTimeout = window.setTimeout(() => {
      if (!videoPlayer.$isPlaying || isSomeMenuOpen()) {
        return;
      }
      hideControls();
    }, 2000);
  }

  function handleMouseMove(event: MouseEvent): void {
    if (!showCustomControls) {
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
    if (videoPlayer.$isPlaying && !isSomeMenuOpen()) {
      hideControls();
    }
  }

  onMount(() => {
    mainElement = document.querySelector('main.watch-main');
    if (!mainElement) {
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

      // TODO: add double-click support to toggle fullscreen

      if (videoPlayer.$isPlaying) {
        videoPlayer.pause();
        showControls();
      } else {
        videoPlayer.play();
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
              videoPlayer.pause();
              showControls();
            } else {
              videoPlayer.play();
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
          videoPlayer.seek(videoPlayer.$currentTime - 5);
          showControls();
          scheduleHide();
          break;

        case 'l':
          videoPlayer.seek(videoPlayer.$currentTime + 5);
          showControls();
          scheduleHide();
          break;

        case 'f':
          playerControlsBottomRef?.toggleFullscreen();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown, { passive: true });
    mainElement.querySelector<HTMLDivElement>('.video-container')!.addEventListener('click', handleVideoContainerClick, { passive: true });

    document.addEventListener('fullscreenchange', handleFullscreenChange, { passive: true });

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);

      if (hideTimeout) {
        clearTimeout(hideTimeout);
      }

      if (mainElement) {
        mainElement.removeEventListener('mousemove', handleMouseMove);
        mainElement.removeEventListener('mouseleave', handleMouseLeave);
        mainElement.style.cursor = '';

        mainElement.querySelector<HTMLDivElement>('.video-container')!.removeEventListener('click', handleVideoContainerClick);
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
        mediaMetadata={videoPlayer.mediaMetadata}
        episodeTitlePrefix={episodeTitlePrefix} />
      <ControlsBottomBar
        bind:this={playerControlsBottomRef}
        videoPlayer={videoPlayer}
      />
    </div>
  {/if}
</div>

<style>
  .video-player-ui-container {
    position: absolute;
    top:      56px;
    left:     0;
    right:    0;
    bottom:   0;
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
