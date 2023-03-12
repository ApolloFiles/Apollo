import * as CommunicationProtocol from '../../../../../src/media/video/live_transcode/synced_video_playback/CommunicationProtocol';
import ApolloVideoPlayer from './VideoPlayer/ApolloVideoPlayer';
import LiveTranscodeVideoWrapper from './VideoPlayer/LiveTranscodeVideoWrapper';

type OtherClient = CommunicationProtocol.ClientConnectMessage['data'] & { state: CommunicationProtocol.StateData };

class ApolloSyncedVideoPlayer {
  private player: ApolloVideoPlayer;
  private videoPlayerLoading: boolean = true;
  private playerApplyingState: boolean = false;

  private ignoreNextSeekedEvent: boolean = false;
  private nextStatePingMessage: number = 0;

  private websocket: WebSocket | null = null;

  private clientId?: string;
  private displayName?: string;
  private otherClients: OtherClient[] = [];
  private superMasterClientId?: string;

  constructor(player: ApolloVideoPlayer) {
    this.player = player;

    // FIXME: If autoplay has been blocked, syncing will bug once the user clicks play

    player._videoElement.addEventListener('loadstart', () => {
      this.videoPlayerLoading = true;
      // this.sendStatePingMessage();
    });
    player._videoElement.addEventListener('canplay', () => {
      if (!this.videoPlayerLoading) {
        return;
      }

      setTimeout(() => {
        if (this.videoPlayerLoading) {
          this.videoPlayerLoading = false;
          // this.sendStatePingMessage();
        }
      }, 1500);
    });
    player._videoElement.addEventListener('canplaythrough', () => {
      this.videoPlayerLoading = false;
      // this.sendStatePingMessage();
    });
    player._videoElement.addEventListener('timeupdate', () => {
      // this.sendStatePingMessage();
      // this.updateDisplayedClients();
    });
    player._videoElement.addEventListener('playing', () => {
      // this.sendStatePingMessage();
    });
    player._videoElement.addEventListener('waiting', () => {
      this.videoPlayerLoading = true;
      // this.sendStatePingMessage();
    });
    player._videoElement.addEventListener('pause', () => {
      this.sendSyncStateMessage();
      console.log('Sent syncState (pause)');
    });
    player._videoElement.addEventListener('play', () => {
      this.sendSyncStateMessage();
      console.log('Sent syncState (play)');
    });
    player._videoElement.addEventListener('ratechange', () => {
      this.sendSyncStateMessage();
      console.log('Sent syncState (ratechange)');
    });
    player._videoElement.addEventListener('seeked', () => {
      if (this.ignoreNextSeekedEvent) {
        this.ignoreNextSeekedEvent = false;
        return;
      }

      this.sendSyncStateMessage();
      console.log('Sent syncState (seeked)');
    });

    setInterval(() => {
      // TODO: Make delay dynamic based on playing/paused state
      //       Maybe even pretty big delays when paused, which get bypassed by other clients joining so they don't have to wait too long
      this.sendStatePingMessage();
      this.updateDisplayedClients();
    }, 1000);
  }

  connect(): void {
    const webSocketUri = ApolloSyncedVideoPlayer.generateWebSocketUri();
    console.log(`Connecting to websocket at '${webSocketUri}'...`);

    this.websocket = new WebSocket(webSocketUri, 'live-transcode');
    this.websocket.addEventListener('error', (err) => console.error('WebSocket error:', err));
    this.websocket.addEventListener('close', (event) => console.log('WebSocket closed:', event));
    this.websocket.addEventListener('open', () => console.log('WebSocket opened'));

    this.websocket.addEventListener('message', (event) => {
      let msg;
      try {
        msg = this.parseMessage(event);
      } catch (err: any) {
        this.websocket?.close(1003, err.message);
        throw err;
      }

      if (msg.type !== 'welcome') {
        throw new Error(`Unexpected message type '${msg.type}' - expected 'welcome'`);
      }
      const welcomeData: CommunicationProtocol.WelcomeMessage['data'] = msg.data;

      this.clientId = welcomeData.clientId;
      this.displayName = welcomeData.displayName;
      console.log('Received welcome:', {clientId: this.clientId, displayName: this.displayName});

      const applyState = (state: CommunicationProtocol.StateData): void => {
        this.playerApplyingState = true;

        if (state.paused) {
          this.player._videoElement.pause();
        }

        this.ignoreNextSeekedEvent = true;
        this.player._videoElement.playbackRate = state.playbackRate;
        this.player._videoElement.currentTime = state.currentTime;

        if (!state.paused && this.player.videoWrapper.paused) {
          this.player._videoElement.play()
              .catch((err) => console.error(JSON.stringify(err)))
              .finally(() => this.playerApplyingState = false);
        } else {
          this.playerApplyingState = false;
        }

        this.updateDebugInfo();
        // this.updateDisplayedClients();
      };

      if (welcomeData.initialState != null && this.player.videoWrapper.getLoadedMediaUri() != welcomeData.initialState.media.uri) {
        this.player.loadMedia(welcomeData.initialState.media.uri, welcomeData.initialState.media.mode)
            .then(() => {
              const duration = welcomeData.initialState!.media.duration;
              if (duration != null && this.player.videoWrapper instanceof LiveTranscodeVideoWrapper) {
                this.player.videoWrapper.duration = duration;
              }

              if (welcomeData.initialState != null) {
                applyState(welcomeData.initialState);
              }
            })
            .catch((err) => console.error(err));
      } else {
        if (welcomeData.initialState != null) {
          applyState(welcomeData.initialState);
        }
      }

      this.websocket?.addEventListener('message', (event) => {
        const msg = this.parseMessage(event);

        switch (msg.type) {
          case 'clientConnect':
            this.otherClients.push({
              ...msg.data,
              state: {
                paused: true,
                currentTime: 0,
                playbackRate: 1
              }
            });
            // this.updateDisplayedClients();
            break;
          case 'clientDisconnect':
            this.otherClients = this.otherClients.filter((client) => client.clientId !== msg.data.clientId);
            // this.updateDisplayedClients();
            break;
          case 'superMasterChange':
            this.superMasterClientId = msg.data.clientId;
            break;
          case 'mediaChange':
            console.log('Media change:', msg.data.media);
            this.player.loadMedia(msg.data.media.uri, msg.data.media.mode)
                .then(() => {
                  if (this.player.videoWrapper instanceof LiveTranscodeVideoWrapper && msg.data.media.duration != null) {
                    this.player.videoWrapper.duration = msg.data.media.duration;
                  }
                })
                .catch((err) => console.error(err));
            break;
          case 'syncState':
            if (msg.data.clientId === this.clientId) {
              console.warn('Received sync state from self');
              break;
            }

            applyState(msg.data.state);
            break;
          case 'statePing':
            if (msg.data.clientId === this.clientId) {
              console.warn('Received state ping from self');
              break;
            }

            this.otherClients.find((client) => client.clientId === msg.data.clientId)!.state = msg.data.state;
            // this.updateDisplayedClients();
            break;
          default:
            console.warn(`Unhandled message type '${msg.type}'`);
            break;
        }

        this.updateDebugInfo();
      });
    }, {once: true});
  }

  getOwnPlaybackState(): CommunicationProtocol.StateData {
    return {
      paused: this.player._videoElement.paused || this.videoPlayerLoading,
      currentTime: this.player._videoElement.currentTime,
      playbackRate: this.player._videoElement.playbackRate
    };
  }

  private updateDebugInfo(): void {
    document.getElementById('playbackSyncDebug')!.innerText = JSON.stringify({
      clientId: this.clientId,
      displayName: this.displayName,
      otherClients: this.otherClients
    }, null, 2);
  }

  private updateDisplayedClients(): void {
    const template = document.querySelector<HTMLTemplateElement>('#syncedClientsContainer template')!;
    const clientListElement = document.getElementById('syncedClientList')!;
    clientListElement.innerHTML = '';
    if (this.displayName == null) {
      return;
    }

    // TODO: Update existing elements instead of recreating them
    // TODO: Maybe we can avoid the below code getting executed if nothing changed
    const appendClientElement = (client: OtherClient): void => {
      const clone = template.content.cloneNode(true) as HTMLElement;

      const displayTextElement = clone.querySelector<HTMLElement>('[data-template-content="displayName"]')!;
      displayTextElement.innerText = client.displayName;

      if (this.superMasterClientId === client.clientId) {
        displayTextElement.innerHTML += '&nbsp;<span class="material-icons icon-inline">star</span>';
      }

      displayTextElement.removeAttribute('data-template-content');

      const currentTimesElement = clone.querySelector<HTMLElement>('[data-template-content="currentTimes"]')!;
      let currentTimesInnerHtml = '<span class="material-icons icon-inline">play_arrow</span>';
      if (client.state.paused) {
        currentTimesInnerHtml = '<span class="material-icons icon-inline">pause</span>';
      }
      currentTimesInnerHtml += '&nbsp;' + ApolloVideoPlayer.formatTime(client.state.currentTime);

      currentTimesElement.innerHTML = currentTimesInnerHtml;
      currentTimesElement.removeAttribute('data-template-content');

      clientListElement.appendChild(clone);
    };

    appendClientElement({
      clientId: this.clientId!,
      displayName: `${this.displayName} (Du)`,
      state: this.getOwnPlaybackState()
    });
    for (const client of this.otherClients) {
      appendClientElement(client);
    }
  }

  private sendSyncStateMessage(): void {
    if (this.playerApplyingState) {
      console.warn('Player is applying state, not sending sync state');
      return;
    }

    this.sendMessage<CommunicationProtocol.SyncStateMessage>({
      type: 'syncState',
      data: {
        clientId: this.clientId!,
        state: this.getOwnPlaybackState()
      }
    });
  }

  private sendStatePingMessage(): void {
    if (Date.now() < this.nextStatePingMessage) {
      return;
    }

    this.sendMessage<CommunicationProtocol.StatePingMessage>({
      type: 'statePing',
      data: {
        clientId: this.clientId!,
        state: this.getOwnPlaybackState()
      }
    });
    this.nextStatePingMessage = Date.now() + 1000;
  }

  private sendMessage<T extends CommunicationProtocol.Message>(msg: T): void {
    if (this.websocket == null) {
      throw new Error('Unable to send message, websocket is not connected');
    }

    this.websocket.send(JSON.stringify(msg));
  }

  private parseMessage(event: MessageEvent): CommunicationProtocol.Message {
    if (typeof event.data !== 'string') {
      throw new Error('Received non-string message from websocket');
    }

    const jsonData = JSON.parse(event.data);
    if (typeof jsonData !== 'object' || jsonData == null ||
        typeof jsonData.type !== 'string' || typeof jsonData.data !== 'object') {
      throw new Error('Received invalid message from websocket: ' + event.data);
    }

    return jsonData;
  }

  private static generateWebSocketUri(): string {
    const origin = location.origin.toString();
    if (!origin.startsWith('http')) {
      throw new Error('Unable to generate websocket URI, location.origin is not a valid HTTP URL');
    }
    return origin.replace(/http/, 'ws') + '/_ws/live_transcode/' + window.ApolloData.LiveTranscode.sessionId;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.ApolloData?.LiveTranscode == null) {
    throw new Error('ApolloData.LiveTranscode is not defined');
  }

  const videoContainer = document.getElementById('videoContainer');
  if (videoContainer == null) {
    throw new Error('Unable to find videoContainer element');
  }

  const videoPlayer = new ApolloVideoPlayer(videoContainer);
  const syncedVideoPlayer = new ApolloSyncedVideoPlayer(videoPlayer);
  syncedVideoPlayer.connect();
});
