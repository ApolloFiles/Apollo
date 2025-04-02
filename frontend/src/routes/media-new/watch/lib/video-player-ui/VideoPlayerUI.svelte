<script lang="ts">
  import {onMount} from 'svelte';
  import type {MediaWatchPageData} from '../../../../../../../src/frontend/FrontendRenderingDataAccess';
  import type VideoPlayer from '../client-side/VideoPlayer.svelte';
  import VideoContextMenu from './components/VideoContextMenu.svelte';
  import ControlsBottomBar from './layout/ControlsBottomBar.svelte';
  import ControlsTopBar from './layout/ControlsTopBar.svelte';

  const {mediaInfo, videoPlayer}: {
    mediaInfo: MediaWatchPageData['pageData']['media'],
    videoPlayer: VideoPlayer
  } = $props();

  let videoContextMenuRef: VideoContextMenu;
  let playerControlsBottomRef: ControlsBottomBar;
  let closeOtherMenusRef = $state((): void => undefined);

  let controlsVisible = $state(true);
  let hideTimeout: number | undefined;
  let mainElement: HTMLElement | null = null;

  function isSomeMenuOpen(): boolean {
    return videoContextMenuRef?.isVisible() || playerControlsBottomRef?.isAnyMenuOpen();
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
    if (mainElement) {
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
    showControls();

    if (event.target instanceof HTMLElement) {
      const isHoveringControls = event.target.closest('.controls-overlay');
      if (!isHoveringControls) {
        scheduleHide();
      }
    }
  }

  onMount(() => {
    closeOtherMenusRef = playerControlsBottomRef.closeAllMenus;

    mainElement = document.querySelector('main.watch-main');
    if (!mainElement) return;

    mainElement.addEventListener('mousemove', handleMouseMove);
    mainElement.addEventListener('mouseleave', () => {
      if (videoPlayer.$isPlaying && !isSomeMenuOpen()) {
        hideControls();
      }
    });

    const handleVideoContainerClick = (event: MouseEvent) => {
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

    mainElement.querySelector<HTMLDivElement>('.video-container')!.addEventListener('click', handleVideoContainerClick, {passive: true});

    return () => {
      if (hideTimeout) clearTimeout(hideTimeout);
      if (mainElement) {
        mainElement.removeEventListener('mousemove', handleMouseMove);
        mainElement.style.cursor = '';

        mainElement.querySelector<HTMLDivElement>('.video-container')!.removeEventListener('click', handleVideoContainerClick);
      }
    };
  });
</script>

<VideoContextMenu
  bind:this={videoContextMenuRef}
  closeOtherMenus={closeOtherMenusRef}/>
<div
  class="controls-overlay"
  class:fade-out={!controlsVisible}
  onmouseenter={showControls}
  role="region"
  aria-label="Video player controls"
>
  <ControlsTopBar mediaInfo={mediaInfo}/>
  <ControlsBottomBar
    bind:this={playerControlsBottomRef}
    mediaInfo={mediaInfo}
    videoPlayer={videoPlayer}
  />
</div>

<style>
  .controls-overlay {
    position:        absolute;
    top:             0;
    left:            0;
    right:           0;
    bottom:          0;
    background:      linear-gradient(
                       to bottom,
                       rgba(0, 0, 0, 0.75) 0%,
                       transparent 20%,
                       transparent 80%,
                       rgba(0, 0, 0, 0.75) 100%
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
