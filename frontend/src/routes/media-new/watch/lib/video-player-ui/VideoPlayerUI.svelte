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

  let playerControlsBottomRef: ControlsBottomBar;
  let closeOtherMenusRef = $state((): void => undefined);

  onMount(() => closeOtherMenusRef = playerControlsBottomRef.closeAllMenus);
</script>

<VideoContextMenu closeOtherMenus={closeOtherMenusRef}/>
<div class="controls-overlay">
  <ControlsTopBar mediaInfo={mediaInfo}/>
  <ControlsBottomBar bind:this={playerControlsBottomRef} mediaInfo={mediaInfo} videoPlayer={videoPlayer}/>
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
  }
</style>
