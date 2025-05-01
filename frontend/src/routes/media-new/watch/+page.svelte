<svelte:head>
  <title>{episodeTitlePrefix}{mediaTitle}</title>
</svelte:head>

<script lang="ts">
  import { onMount } from 'svelte';
  import type { AuthenticatedPageRequestData } from '../../../../../src/frontend/FrontendRenderingDataAccess';
  import type { StartPlaybackResponse } from '../../../../../src/webserver/Api/v0/media/player-session/change-media';
  import VideoLiveTranscodeBackend from './lib/client-side/backends/VideoLiveTranscodeBackend';
  import VideoPlayer from './lib/client-side/VideoPlayer.svelte';
  import VideoPlayerUI from './lib/video-player-ui/VideoPlayerUI.svelte';

  const { data }: { data: AuthenticatedPageRequestData } = $props();

  let mediaTitle = $state('');
  let episodeTitlePrefix = $state('');

  let videoContainerRef: HTMLDivElement;

  let transcodeRestartInProgress = false;

  async function createVideoPlayer(playbackStatus: StartPlaybackResponse, initialAudioTrack?: number, initialSubtitleTrack?: number): Promise<VideoPlayer> {
    const backend = await VideoLiveTranscodeBackend.create(videoContainerRef, {
      backend: {
        src: playbackStatus.hlsManifest,
        initialAudioTrack,
        initialSubtitleTrack,

        totalDurationInSeconds: playbackStatus.totalDurationInSeconds,
        startOffset: playbackStatus.startOffsetInSeconds,
        restartTranscode: (startOffset, activeAudioTrack, activeSubtitleTrack) => {
          if (transcodeRestartInProgress) {
            return;
          }

          transcodeRestartInProgress = true;

          videoPlayerPromise?.then((videoPlayer) => videoPlayer.destroy());
          videoPlayerPromise = restartVideoLiveTranscode(playbackStatus.mediaMetadata.mediaItemId, startOffset, activeAudioTrack, activeSubtitleTrack)
            .finally(() => {
              transcodeRestartInProgress = false;
            });
        },
      },
    });

    mediaTitle = playbackStatus.mediaMetadata.title;
    episodeTitlePrefix = playbackStatus.mediaMetadata.episode ? `S${playbackStatus.mediaMetadata.episode.season.toString()
      .padStart(2, '0')}E${playbackStatus.mediaMetadata.episode.episode.toString().padStart(2, '0')} • ` : '';

    return new VideoPlayer(backend, playbackStatus.mediaMetadata);
  }

  async function restartVideoLiveTranscode(mediaItemId: string, startOffset: number, initialAudioTrack: number, initialSubtitleTrack: number): Promise<VideoPlayer> {
    const changeMediaResponse = await fetch('/api/v0/media/player-session/change-media', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        mediaItemId,
        startOffset,
      }),
    });

    const changeMediaBody: StartPlaybackResponse = await changeMediaResponse.json();
    return createVideoPlayer(changeMediaBody, initialAudioTrack, initialSubtitleTrack);
  }

  async function initVideoPlayer() {
    const playbackStatusResponse = await fetch(`/api/v0/media/player-session/playback-status`, { headers: { Accept: 'application/json' } });
    if (!playbackStatusResponse.ok) {
      throw new Error(`change-media endpoint responded with Status ${playbackStatusResponse.status}: ${await playbackStatusResponse.text()}`);
    }

    if (playbackStatusResponse.status === 204) {
      // TODO: Show info to user that there is nothing to play (maybe with link to media library)
    }

    const playbackStatusBody: StartPlaybackResponse = await playbackStatusResponse.json();
    return createVideoPlayer(playbackStatusBody);
  }

  let videoPlayerPromise: Promise<VideoPlayer> | undefined = $state(undefined);

  onMount(() => {
    videoPlayerPromise = initVideoPlayer();

    return () => {
      videoPlayerPromise?.then((videoPlayer) => videoPlayer.destroy());
    };
  });
</script>

<main class="watch-main">
  <div class="video-container" bind:this={videoContainerRef}></div>

  {#await videoPlayerPromise}
    <div class="loading-container">
      <span class="spinner">0</span>
    </div>
  {:then videoPlayer}
    {#if videoPlayer}
      <VideoPlayerUI
        videoPlayer={videoPlayer}
        showCustomControls={videoPlayer.$shouldShowCustomControls}
        episodeTitlePrefix={episodeTitlePrefix}
      />
    {:else}
      <div class="loading-container">
        <span class="spinner">0</span>
      </div>
    {/if}
  {/await}
</main>

<style>
  main {
    width:            100vw;
    height:           100vh;
    background-color: black;
    display:          flex;
    justify-content:  center;
  }

  .video-container {
    display: contents;
  }

  :global(.video-container video) {
    max-width:  100%;
    max-height: 100%;
  }

  .loading-container {
    position:  absolute;
    top:       50%;
    left:      50%;
    transform: translate(-50%, -50%);
  }

  .spinner {
    display:   inline-block;
    color:     white;
    font-size: 48px;
    animation: spin 2s infinite linear;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
