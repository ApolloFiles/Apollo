<script lang="ts">
  import IconArrowBack from 'virtual:icons/tabler/arrow-back-up';
  import IconPlayerSkipForward from 'virtual:icons/tabler/player-skip-forward';
  import IconPlayerSkipBack from 'virtual:icons/tabler/player-skip-back';
  import type VideoPlayer from '../../client-side/VideoPlayer.svelte';

  const { episodeTitlePrefix, mediaMetadata }: {
    episodeTitlePrefix: string,
    mediaMetadata: VideoPlayer['mediaMetadata']
  } = $props();
</script>

<div class="top-bar">
  <div class="left-section">
    <button class="back-button"><IconArrowBack /></button>
    <div class="video-title-container">
      <h1 class="video-title">{mediaMetadata.title}</h1>
      {#if mediaMetadata.episode}
        <h2 class="episode-title">{episodeTitlePrefix}{mediaMetadata.episode.title}</h2>
      {/if}
    </div>
  </div>
  <div class="right-section">
    <button class="control-button"><IconPlayerSkipBack /></button>
    <button class="control-button"><IconPlayerSkipForward /></button>
  </div>
</div>

<style>
  .top-bar {
    padding:         20px;
    display:         flex;
    justify-content: space-between;
    align-items:     center;
    pointer-events:  auto;
  }

  .left-section {
    display:     flex;
    gap:         20px;
    align-items: center;
  }

  .right-section {
    display:     flex;
    gap:         10px;
    align-items: center;
  }

  .back-button {
    background:    transparent;
    color:         white;
    border:        1px solid white;
    padding:       8px 16px;
    border-radius: 4px;
    cursor:        pointer;
  }

  .video-title-container {
    display:        flex;
    flex-direction: column;
    gap:            4px;
  }

  .video-title {
    color:       white;
    margin:      0;
    font-size:   1.2rem;
    font-weight: normal;
    line-height: 1.2;
  }

  .episode-title {
    color:       rgba(255, 255, 255, 0.7);
    margin:      0;
    font-size:   1rem;
    font-weight: normal;
    line-height: 1.2;
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
</style>
