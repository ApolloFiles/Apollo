<script lang="ts">
  import IconSubtitles from 'virtual:icons/tabler/badge-cc';
  import IconHeadphones from 'virtual:icons/tabler/headphones';
  import IconPause from 'virtual:icons/tabler/player-pause';
  import IconPlay from 'virtual:icons/tabler/player-play';
  import type VideoPlayer from '../../client-side/VideoPlayer.svelte';
  import BottomMenuBox from '../components/BottomMenuBox.svelte';
  import FullscreenButton from '../components/FullscreenButton.svelte';
  import VideoProgressBar from '../components/progress-bar/VideoProgressBar.svelte';
  import VolumeControl from '../components/VolumeControl.svelte';

  const { videoPlayer }: {
    videoPlayer: VideoPlayer
  } = $props();

  let fullscreenRef: FullscreenButton;
  export const toggleFullscreen = () => fullscreenRef.toggleFullscreen();

  let activeSubtitleTrack = $derived(videoPlayer.$activeSubtitleTrack);
  let activeAudioTrack = $derived(videoPlayer.$activeAudioTrackId);
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
  {#key videoPlayer}
    <VideoProgressBar videoPlayer={videoPlayer} />
  {/key}

  <div class="buttons-row">
    <div class="left-controls">
      <button class="control-button play-button"
              onclick={() => videoPlayer.$isPlaying ? videoPlayer.pause(true) : videoPlayer.play(true)}>
        {#if videoPlayer.$isPlaying}
          <IconPause />
        {:else}
          <IconPlay />
        {/if}
      </button>
      {#key videoPlayer}
        <VolumeControl
          bind:volume={videoPlayer.$volume}
          bind:muted={videoPlayer.$muted}
        />
      {/key}
    </div>

    <div class="right-controls">
      <BottomMenuBox
        bind:menuVisible={showSubtitleTrackMenu}
        bind:activeItem={activeSubtitleTrack}
        menuItems={[{id: '', label: 'None' }, ...videoPlayer.$subtitleTracks]}
        onSelect={(id) => id === '' ? (videoPlayer.$activeSubtitleTrackId = null) : (videoPlayer.$activeSubtitleTrackId = id)}
        onMenuOpen={() => closeAllMenus()}
      ><IconSubtitles /></BottomMenuBox>
      <BottomMenuBox
        bind:menuVisible={showAudioTrackMenu}
        bind:activeItemId={activeAudioTrack}
        menuItems={videoPlayer.$audioTracks}
        onSelect={(id) => videoPlayer.$activeAudioTrackId = id}
        onMenuOpen={() => closeAllMenus()}
      ><IconHeadphones /></BottomMenuBox>

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
