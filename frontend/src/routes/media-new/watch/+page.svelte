<svelte:head>
  <title>{episodeTitlePrefix}{mediaTitle}</title>
</svelte:head>

<script lang="ts">
  import { onMount } from 'svelte';
  import type { AuthenticatedPageRequestData } from '../../../../../src/frontend/FrontendRenderingDataAccess';
  import {
    type MediaChangedMessage,
    type SessionInfoMessage,
    type WebSocketMessage,
  } from '../../../../../src/media/video-player/websocket/WebSocketDataBuilder';
  import { MESSAGE_TYPE } from '../../../../../src/media/video-player/websocket/WebSocketDataMessageType';
  import type { StartPlaybackResponse } from '../../../../../src/webserver/Api/v0/media/player-session/change-media';
  import type { PlayerSessionInfoResponse } from '../../../../../src/webserver/Api/v0/media/player-session/info';
  import VideoLiveTranscodeBackend from './lib/client-side/backends/VideoLiveTranscodeBackend';
  import VideoPlayer from './lib/client-side/VideoPlayer.svelte';
  import { fetchPlaybackSessionInfo } from './lib/playback-session-backend-api';
  import PlaybackSessionButton from './lib/PlaybackSessionButton.svelte';
  import VideoPlayerUI from './lib/video-player-ui/VideoPlayerUI.svelte';

  const { data }: { data: AuthenticatedPageRequestData } = $props();

  let mediaTitle = $state('');
  let episodeTitlePrefix = $state('');
  let sessionInfo: PlayerSessionInfoResponse['session'] | null = $state(null);
  let sessionId: string | null = $state(null);

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

          videoPlayerPromise?.then((videoPlayer) => videoPlayer?.destroy());
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

  async function initVideoPlayer(): Promise<VideoPlayer | null> {
    const playbackStatusResponse = await fetchPlaybackSessionInfo();
    sessionInfo = playbackStatusResponse.session;
    sessionId = sessionInfo.id;

    if (playbackStatusResponse.playbackStatus != null) {
      return createVideoPlayer(playbackStatusResponse.playbackStatus);
    }
    return null;
  }

  async function initWebSocket(): Promise<void> {
    if (sessionId == null) {
      throw new Error('Session ID is not set, cannot initialize WebSocket');
    }

    const websocket = new WebSocket(`ws://${location.host}/_ws/media-new/watch/${encodeURIComponent(sessionId)}`);
    websocket.onopen = () => {
      console.log('WebSocket connection established');
    };

    websocket.onclose = (event) => {
      console.warn('WebSocket connection closed:', event.code, event.reason);

      switch (event.code) {
        case 1002: // Protocol Error
          console.error('WebSocket disconnected due to protocol error, reloading page...');
          window.location.reload();
          break;

        case 1001: // Going Away
        case 1005: // No Status Received
        case 1006: // Abnormal Closure
        case 1011: // Internal Error
        case 1012: // Service Restart
        case 1013: // Try Again Later
        case 1014: // Bad gateway
          console.info('Reconnecting WebSocket in 5 seconds...');
          setTimeout(() => initWebSocket(), 5000);
          break;

        case 3000: // Unauthorized
        case 3003: // Forbidden
          alert('Authentication error occurred, please reload the page');
          break;

        default:
          alert('WebSocket connection closed, please reload the page (code=' + event.code + `,reason=${event.reason})`);
          break;
      }
    };
    websocket.onerror = (event) => {
      console.error('WebSocket error:', event);
    };

    websocket.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      if (!isWebSocketMessage(message)) {
        throw new Error('Received message is not a valid WebSocketMessage: ' + event.data);
      }

      switch (message.type) {
        case MESSAGE_TYPE.SESSION_INFO:
          const sessionInfoData = message.data as SessionInfoMessage['data'];
          sessionInfo = sessionInfoData;
          console.log('Updated session info:', sessionInfoData);
          break;

        case MESSAGE_TYPE.MEDIA_CHANGED:
          const mediaChangedData = message.data as MediaChangedMessage['data'];

          videoPlayerPromise = Promise.resolve(null);
          if (mediaChangedData.media != null) {
            videoPlayerPromise = createVideoPlayer(mediaChangedData.media);
            return;
          }
          break;

        default:
          console.error('Unknown WebSocket message type:', message.type, 'with data:', message.data);
          break;
      }
    };

    function isWebSocketMessage(message: object): message is WebSocketMessage {
      return 'type' in message &&
        typeof message.type === 'number' &&
        'data' in message &&
        typeof message.data === 'object';
    }
  }

  let videoPlayerPromise: Promise<VideoPlayer | null> | undefined = $state(undefined);

  onMount(() => {
    videoPlayerPromise = initVideoPlayer();
    videoPlayerPromise.then(() => initWebSocket());

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
        <PlaybackSessionButton bind:sessionId={sessionId} bind:sessionInfo={sessionInfo} />
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
        videoPlayer={videoPlayer}
        showCustomControls={videoPlayer.$shouldShowCustomControls}
        episodeTitlePrefix={episodeTitlePrefix}
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
