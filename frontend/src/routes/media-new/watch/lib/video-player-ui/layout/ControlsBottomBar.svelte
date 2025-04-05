<script lang="ts">
  import type { MediaWatchPageData } from '../../../../../../../../src/frontend/FrontendRenderingDataAccess';
  import type VideoPlayer from '../../client-side/VideoPlayer.svelte';
  import BottomMenuBox from '../components/BottomMenuBox.svelte';
  import FullscreenButton from '../components/FullscreenButton.svelte';
  import VideoProgressBar from '../components/progress-bar/VideoProgressBar.svelte';
  import VolumeControl from '../components/VolumeControl.svelte';

  const { mediaInfo, videoPlayer }: {
    mediaInfo: MediaWatchPageData['pageData']['media'],
    videoPlayer: VideoPlayer
  } = $props();

  let fullscreenRef: FullscreenButton;
  export const toggleFullscreen = () => fullscreenRef.toggleFullscreen();

  let activeSubtitleTrack = $state('');
  let activeAudioTrack = $state(mediaInfo.audioTracks[0]);
  let showSubtitleTrackMenu = $state(false);
  let showAudioTrackMenu = $state(false);

  export function isAnyMenuOpen(): boolean {
    return showSubtitleTrackMenu || showAudioTrackMenu;
  }

  export function closeAllMenus(): void {
    showSubtitleTrackMenu = false;
    showAudioTrackMenu = false;
  }
</script>

<div class="control-bar">
  <VideoProgressBar videoPlayer={videoPlayer} />

  <div class="buttons-row">
    <div class="left-controls">
      <button class="control-button play-button"
              onclick={() => videoPlayer.$isPlaying ? videoPlayer.pause() : videoPlayer.play()}>{videoPlayer.$isPlaying ? '⏸' : '▶'}</button>
      <VolumeControl
        bind:volume={videoPlayer.$volume}
        bind:muted={videoPlayer.$muted}
      />
    </div>

    <div class="right-controls">
      <BottomMenuBox
        buttonLabel="CC"
        bind:menuVisible={showSubtitleTrackMenu}
        bind:activeItemId={activeSubtitleTrack}
        menuItems={[{id: '', label: 'None' }, ...mediaInfo.subtitleTracks.map(track => ({ id: track, label: track }))]}
        onSelect={(id) => activeSubtitleTrack = id}
        onMenuOpen={() => closeAllMenus()}
      />
      <BottomMenuBox
        buttonLabel="🔊"
        bind:menuVisible={showAudioTrackMenu}
        bind:activeItemId={activeAudioTrack}
        menuItems={mediaInfo.audioTracks.map(track => ({ id: track, label: track }))}
        onSelect={(id) => activeSubtitleTrack = id}
        onMenuOpen={() => closeAllMenus()}
      />

      <FullscreenButton bind:this={fullscreenRef} />
    </div>
  </div>
</div>

<style>
  .control-bar {
    padding:        20px;
    display:        flex;
    flex-direction: column;
    gap:            10px;
    pointer-events: auto;
  }

  .buttons-row {
    display:         flex;
    justify-content: space-between;
    align-items:     center;
    width:           100%;
  }

  .left-controls, .right-controls {
    display:     flex;
    gap:         10px;
    align-items: center;
  }

  .control-button {
    background:      transparent;
    color:           white;
    border:          none;
    padding:         8px;
    cursor:          pointer;
    font-size:       1.2rem;
    width:           40px;
    height:          40px;
    display:         flex;
    align-items:     center;
    justify-content: center;
    border-radius:   50%;
    transition:      background-color 0.2s;
  }

  .control-button:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }

  .right-controls {
    display:     flex;
    gap:         10px;
    align-items: center;
    position:    relative;
  }
</style>
