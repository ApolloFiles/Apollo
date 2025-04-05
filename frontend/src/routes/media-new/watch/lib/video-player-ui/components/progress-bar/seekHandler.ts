import type VideoPlayer from '../../../client-side/VideoPlayer.svelte.js';

export interface SeekHandlerContext {
  videoPlayer: VideoPlayer;
  progressBarContainer: HTMLDivElement;
  seekHandle: HTMLDivElement;
  onSeekMove: (position: number, percentage: number, time: number) => void;
  onSeekStart: () => void;
  onSeekEnd: () => void;
}

interface SeekState {
  wasPlayingBeforeSeek: boolean;
  lastSeekTime: number;
  usingSeekHandle: boolean;
}

export function initializeSeekHandler(context: SeekHandlerContext): () => void {
  const state: SeekState = {
    wasPlayingBeforeSeek: false,
    lastSeekTime: 0,
    usingSeekHandle: false,
  };

  const handlers = createSeekHandlers(context, state);
  return attachEventListeners(context, handlers);
}

function createSeekHandlers(context: SeekHandlerContext, state: SeekState) {
  const handleSeekMove = (clientX: number) => {
    const { position, percentage } = calculateSeekPosition(clientX, context.progressBarContainer);
    const time = context.videoPlayer.$duration * percentage;

    state.lastSeekTime = time;
    context.onSeekMove(position, percentage * 100, time);

    requestAnimationFrame(() => {
      context.videoPlayer.fastSeek(time);
    });
  };

  const handleSeekStart = (clientX: number) => {
    state.wasPlayingBeforeSeek = context.videoPlayer.$isPlaying;
    state.usingSeekHandle = true;
    context.videoPlayer.pause();
    document.addEventListener('selectstart', preventSelection);
    document.body.classList.add('seeking');
    context.seekHandle.classList.add('seeking');
    context.onSeekStart();

    handleSeekMove(clientX);
  };

  const handleSeekEnd = (): void => {
    if (!state.usingSeekHandle) {
      return;
    }

    state.usingSeekHandle = false;
    document.removeEventListener('selectstart', preventSelection);
    document.body.classList.remove('seeking');
    context.seekHandle.classList.remove('seeking');

    context.videoPlayer.seek(state.lastSeekTime);
    if (state.wasPlayingBeforeSeek) {
      context.videoPlayer.play();
    }

    context.onSeekEnd();
  };

  return { handleSeekMove, handleSeekStart, handleSeekEnd };
}

function calculateSeekPosition(clientX: number, container: HTMLDivElement) {
  const rect = container.getBoundingClientRect();
  const position = Math.max(0, Math.min(clientX - rect.left, rect.width));
  const percentage = position / rect.width;
  return { position, percentage };
}

function attachEventListeners(context: SeekHandlerContext, handlers: ReturnType<typeof createSeekHandlers>): () => void {
  const { handleSeekMove, handleSeekStart, handleSeekEnd } = handlers;

  const handleMouseMove = (event: MouseEvent): void => {
    if (!context.seekHandle.classList.contains('seeking')) {
      return;
    }
    handleSeekMove(event.clientX);
  };

  const handleTouchMove = (event: TouchEvent): void => {
    if (!context.seekHandle.classList.contains('seeking')) {
      return;
    }
    handleSeekMove(event.touches[0].clientX);
  };

  const mouseEvents = {
    'mousedown': (event: MouseEvent) => {
      if (event.button === 0) { // left mouse button
        handleSeekStart(event.clientX);
      }
    },
    'mousemove': handleMouseMove,
    'mouseup': handleSeekEnd,
  };

  const touchEvents = {
    'touchstart': (event: TouchEvent) => handleSeekStart(event.touches[0].clientX),
    'touchmove': handleTouchMove,
    'touchend': handleSeekEnd,
    'touchcancel': handleSeekEnd,
  };

  context.seekHandle.addEventListener('mousedown', mouseEvents.mousedown, { passive: false });
  context.progressBarContainer.addEventListener('mousedown', mouseEvents.mousedown, { passive: false });
  document.addEventListener('mousemove', mouseEvents.mousemove, { passive: true });
  document.addEventListener('mouseup', mouseEvents.mouseup, { passive: true });

  context.seekHandle.addEventListener('touchstart', touchEvents.touchstart, { passive: false });
  context.progressBarContainer.addEventListener('touchstart', touchEvents.touchstart, { passive: false });
  document.addEventListener('touchmove', touchEvents.touchmove, { passive: true });
  document.addEventListener('touchend', touchEvents.touchend, { passive: true });
  document.addEventListener('touchcancel', touchEvents.touchcancel, { passive: true });

  return (): void => {
    document.removeEventListener('mousemove', mouseEvents.mousemove);
    document.removeEventListener('mouseup', mouseEvents.mouseup);
    document.removeEventListener('touchmove', touchEvents.touchmove);
    document.removeEventListener('touchend', touchEvents.touchend);
    document.removeEventListener('touchcancel', touchEvents.touchcancel);
    document.removeEventListener('selectstart', preventSelection);
  };
}

function preventSelection(event: Event): void {
  return event.preventDefault();
}
