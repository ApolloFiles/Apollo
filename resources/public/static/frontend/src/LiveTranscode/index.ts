import { PlayerMode } from '../../../../../../src/media/watch/sessions/CommunicationProtocol';
import ApolloVideoPlayer from './watch/player/ApolloVideoPlayer';

document.addEventListener('DOMContentLoaded', () => {
  if (window.ApolloData?.LiveTranscode == null) {
    throw new Error('ApolloData.LiveTranscode is not defined');
  }

  const videoContainer = document.getElementById('videoContainer');
  if (videoContainer == null) {
    throw new Error('Unable to find videoContainer element');
  }

  const apolloVideoPlayer = new ApolloVideoPlayer(window.ApolloData.LiveTranscode.sessionId);
  (window as any).abc = apolloVideoPlayer;  // TODO: remove debug

  doDebugMediaInputs(apolloVideoPlayer);
  doMediaSyncDebugText(apolloVideoPlayer);
});

function doDebugMediaInputs(player: ApolloVideoPlayer): void {
  const debugVideoUrlInput = document.getElementById('debugVideoUrlInput');
  const debugPlayerModeSelect = document.getElementById('debugPlayerModeSelect');
  const debugChangeMediaButton = document.getElementById('debugChangeMediaButton');
  if (!(debugVideoUrlInput instanceof HTMLInputElement) || !(debugPlayerModeSelect instanceof HTMLSelectElement) || debugChangeMediaButton == null) {
    console.error('Unable to find all debug elements for media control');
    return;
  }

  debugChangeMediaButton.addEventListener('click', () => {
    player.requestMediaChange(debugPlayerModeSelect.value as PlayerMode, debugVideoUrlInput.value)
        .catch(console.error);
  });
}

function doMediaSyncDebugText(player: ApolloVideoPlayer): void {
  const textContainer = document.getElementById('playbackSyncDebug');
  if (textContainer == null) {
    console.error('Unable to find debug element #playbackSyncDebug');
    return;
  }

  let dataToDisplay = {
    currentTime: -1,
    playbackRate: -1
  };

  player._playerState.on('stateChanged', () => {
    dataToDisplay.playbackRate = player._playerState.playbackRate;
    textContainer.innerText = JSON.stringify(dataToDisplay, null, 2);
  });
  player._playerState.on('timeChanged', () => {
    dataToDisplay.currentTime = player._playerState.currentTime;
    textContainer.innerText = JSON.stringify(dataToDisplay, null, 2);
  });
}
