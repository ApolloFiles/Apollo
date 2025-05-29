<svelte:head>
  <title>{episodeTitlePrefix}{mediaTitle}</title>
</svelte:head>

<script lang="ts">
  import { onMount } from 'svelte';
  import type { AuthenticatedPageRequestData } from '../../../../../src/frontend/FrontendRenderingDataAccess';
  import type { StartPlaybackResponse } from '../../../../../src/webserver/Api/v0/media/player-session/change-media';
  import VideoLiveTranscodeBackend from './lib/client-side/backends/VideoLiveTranscodeBackend';
  import VideoPlayer from './lib/client-side/VideoPlayer.svelte';
  import WebSocketClient from './lib/client-side/WebSocketClient.svelte';
  import { fetchPlaybackSessionInfo } from './lib/playback-session-backend-api';
  import PlaybackSessionButton from './lib/PlaybackSessionButton.svelte';
  import VideoPlayerUI from './lib/video-player-ui/VideoPlayerUI.svelte';

  const { data }: { data: AuthenticatedPageRequestData } = $props();

  let mediaTitle = $state('');
  let episodeTitlePrefix = $state('');
  let sessionId: string | null = $state(null);  // TODO: Can we determine the sessionId server-side and not have it nullable?
  let webSocketClient: WebSocketClient | undefined = $state(undefined);
  let autoPlayEnabled = $state(false);

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
          if (webSocketClient != null && !webSocketClient.isReferencePlayerSelf()) {
            // Only the reference player should restart (we just have to wait)
            return;
          }

          transcodeRestartInProgress = true;

          videoPlayerPromise?.then((videoPlayer) => videoPlayer?.destroy());
          videoPlayerPromise = restartVideoLiveTranscode(playbackStatus.mediaMetadata.mediaItemId, startOffset, activeAudioTrack, activeSubtitleTrack)
            .finally(() => {
              transcodeRestartInProgress = false;
            });
          videoPlayerPromise.then((videoPlayer) => webSocketClient?.setVideoPlayer(videoPlayer));
        },
      },
    });

    mediaTitle = playbackStatus.mediaMetadata.title;
    episodeTitlePrefix = playbackStatus.mediaMetadata.episode ? `S${playbackStatus.mediaMetadata.episode.season.toString()
      .padStart(2, '0')}E${playbackStatus.mediaMetadata.episode.episode.toString().padStart(2, '0')} • ` : '';

    if (sessionId == null) {
      throw new Error('Session ID is not set, cannot create VideoPlayer');
    }

    return new VideoPlayer(
      backend,
      playbackStatus.mediaMetadata,
      sessionId,
      (): void => {
        if (!autoPlayEnabled) {
          return;
        }

        videoPlayerPromise?.then((videoPlayer) => {
          if (videoPlayer?.mediaMetadata.episode?.nextMedia) {
            initiateMediaChange(videoPlayer.mediaMetadata.episode.nextMedia.mediaItemId, 0);
          } else {
            console.info('Autoplay is enabled, but no next episode found');
          }
        });
      },
      (player, seeked, forceSend) => {
        webSocketClient?.updatePlaybackState(player, seeked, forceSend);
      },
      () => {
        return webSocketClient?.$referencePlayerState ?? null;
      },
      (paused) => {
        if (!webSocketClient?.isReferencePlayerSelf()) {
          webSocketClient?.sendRequestStateChangePlaying(paused);
        }
      },
      (time) => {
        if (!webSocketClient?.isReferencePlayerSelf()) {
          webSocketClient?.sendRequestStateChangeTime(time);
        }
      },
    );
  }

  async function restartVideoLiveTranscode(mediaItemId: string, startOffset: number, initialAudioTrack: number, initialSubtitleTrack: number): Promise<VideoPlayer> {
    if (sessionId == null) {
      throw new Error('Session ID is not set, cannot restart video live transcode');
    }

    const changeMediaResponse = await fetch(`/api/v0/media/player-session/${encodeURIComponent(sessionId)}/change-media`, {
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

  async function initiateMediaChange(mediaItemId: string, startOffset: number): Promise<void> {
    if (sessionId == null) {
      throw new Error('Session ID is not set, cannot restart video live transcode');
    }

    const changeMediaResponse = await fetch(`/api/v0/media/player-session/${encodeURIComponent(sessionId)}/change-media`, {
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

    videoPlayerPromise?.then((videoPlayer) => videoPlayer?.destroy());
    videoPlayerPromise = createVideoPlayer(changeMediaBody);
    videoPlayerPromise.then((videoPlayer) => webSocketClient?.setVideoPlayer(videoPlayer));
  }

  async function initVideoPlayer(): Promise<VideoPlayer | null> {
    const playbackStatusResponse = await fetchPlaybackSessionInfo();
    sessionId = playbackStatusResponse.session.id;

    //    return new VideoPlayer(await HtmlVideoPlayerBackend.create(videoContainerRef, { backend: { src: '/_dev/BigBuckBunny_320x180.mp4' } }), {
    //      mediaItemId: '',
    //      title: 'Big Buck Bunny',
    //    });

    if (playbackStatusResponse.playbackStatus != null) {
      return createVideoPlayer(playbackStatusResponse.playbackStatus);
    }
    return null;
  }

  let videoPlayerPromise: Promise<VideoPlayer | null> | undefined = $state(undefined);

  function initWebSocket(videoPlayer: VideoPlayer | null): void {
    if (sessionId == null) {
      throw new Error('Session ID is not set, cannot initialize WebSocket');
    }

    webSocketClient = new WebSocketClient(
      sessionId,
      (media) => {
        videoPlayerPromise?.then((videoPlayer) => videoPlayer?.destroy());

        if (media == null) {
          videoPlayerPromise = Promise.resolve(null);
          return;
        }

        videoPlayerPromise = createVideoPlayer(media);
        videoPlayerPromise.then((videoPlayer) => webSocketClient?.setVideoPlayer(videoPlayer));
      },
    );
    webSocketClient.setVideoPlayer(videoPlayer);
  }

  onMount(() => {
    videoPlayerPromise = initVideoPlayer();
    videoPlayerPromise.then((videoPlayer) => initWebSocket(videoPlayer));

    return () => {
      videoPlayerPromise?.then((videoPlayer) => videoPlayer?.destroy());
    };
  });
</script>

<header>
  <nav class="navbar">
    <div class="container-fluid">
      <div class="d-flex justify-content-center flex-grow-1">
        <form class="d-flex" role="search">
          <input class="form-control me-2" type="search" placeholder="Search" aria-label="Search">
          <button class="btn btn-outline-light" type="submit">Search</button>
        </form>
      </div>
      <div class="navbar-nav">
        <PlaybackSessionButton
          bind:sessionId={sessionId}
          bind:webSocketClient={webSocketClient}
        />
      </div>
    </div>
  </nav>
</header>

<main class="watch-main">
  <div class="video-container" bind:this={videoContainerRef}></div>

  {#await videoPlayerPromise}
    <div class="loading-container">
      <span class="spinner">0</span>
      <br>
      <span>&nbsp;</span>
    </div>
  {:then videoPlayer}
    {#if videoPlayer}
      <VideoPlayerUI
        bind:autoPlayEnabled={autoPlayEnabled}
        videoPlayer={videoPlayer}
        showCustomControls={videoPlayer.$shouldShowCustomControls}
        episodeTitlePrefix={episodeTitlePrefix}
        initiateMediaChange={initiateMediaChange}
      />
    {:else}
      <div class="loading-container">
        <span class="spinner">0</span>
        <br>
        <span>Or maybe not loading and just no media to play right now</span>
      </div>
    {/if}
  {/await}
</main>

<style>
  header {
    height: 56px;
  }

  main {
    width:            100%;
    height:           calc(100vh - 56px);
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
    left:      calc(50% - 1rem);
    position:  relative;
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
