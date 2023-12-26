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
  const debugPlayerModeSelect = document.getElementById('debugPlayerModeSelect');
  const debugVideoUrlInput = document.getElementById('debugVideoUrlInput');
  const debugChangeMediaButton = document.getElementById('debugChangeMediaButton');
  const debugFileSelect = document.getElementById('debugFileSelect');
  if (!(debugPlayerModeSelect instanceof HTMLSelectElement) || !(debugVideoUrlInput instanceof HTMLInputElement) || debugFileSelect == null || debugChangeMediaButton == null) {
    console.error('Unable to find all debug elements for media control');
    return;
  }

  function updateUrlInput(modeSelect: HTMLSelectElement, inputElement: HTMLInputElement): void {
    if (modeSelect.value === 'apollo_file' || modeSelect.value === 'live_transcode') {
      inputElement.type = 'hidden';
      debugFileSelect!.style.display = '';
      return;
    }

    inputElement.type = 'text';
    debugFileSelect!.style.display = 'none';
  }

  async function populateFileSelect(startPath: string = '/'): Promise<void> {
    const ulElement = debugFileSelect!.querySelector<HTMLUListElement>('.dropdown-menu')!;
    ulElement.innerHTML = '';

    const apiRes = await fetch('/media/watch/tmp_api/files/list?startPath=' + encodeURIComponent(startPath));
    if (!apiRes.ok) {
      throw new Error('Unable to get file list');
    }

    const files: { path: string, name: string, isDir: boolean }[] = await apiRes.json();

    const liElement = document.createElement('li');
    const preElement = document.createElement('pre');
    preElement.style.display = 'inline';
    preElement.classList.add('dropdown-item-text');
    preElement.innerText = startPath;
    liElement.appendChild(preElement);
    ulElement.appendChild(liElement);

    for (const file of files) {
      const liElement = document.createElement('li');

      const button = document.createElement('button');
      button.classList.add('dropdown-item');
      button.type = 'button';
      button.innerText = file.name + (file.isDir ? '/' : '');
      button.addEventListener('click', () => {
        if (file.isDir) {
          populateFileSelect(file.path);
          setTimeout(() => {
            debugFileSelect!.click();
          });
          return;
        }

        (debugVideoUrlInput as HTMLInputElement).value = file.path;
      });

      liElement.appendChild(button);
      ulElement.appendChild(liElement);
    }
  }

  debugPlayerModeSelect.addEventListener('change', () => updateUrlInput(debugPlayerModeSelect, debugVideoUrlInput), { passive: true });

  debugChangeMediaButton.addEventListener('click', () => {
    player.requestMediaChange(debugPlayerModeSelect.value as PlayerMode, debugVideoUrlInput.value)
      .catch(console.error);
  });

  updateUrlInput(debugPlayerModeSelect, debugVideoUrlInput);
  populateFileSelect().catch(console.error);
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
