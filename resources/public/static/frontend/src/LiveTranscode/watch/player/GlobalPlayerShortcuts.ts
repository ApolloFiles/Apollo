import PlayerController from './PlayerController';
import PlayerControls from './PlayerControls';
import PlayerState from './PlayerState';

export default class GlobalPlayerShortcuts {
  private playerContainerElement: HTMLElement;

  private controls: PlayerControls;
  private controller: PlayerController;
  private playerState: PlayerState;

  constructor(playerContainerElement: HTMLElement, controls: PlayerControls, controller: PlayerController, playerState: PlayerState) {
    this.playerContainerElement = playerContainerElement;

    this.controls = controls;
    this.controller = controller;
    this.playerState = playerState;

    this.registerListeners();
  }

  private registerListeners(): void {
    document.addEventListener('keydown', (event) => {
      if (!this.shouldHandleEvent(event)) {
        return;
      }

      switch (event.key) {
        case 'k':
          if (!event.repeat) {
            this.controller.togglePlay().catch(console.error);
          }
          break;

        case 'm':
          if (!event.repeat) {
            this.playerState.muted = !this.playerState.muted;
          }
          break;

        case 'j':
          this.controller.seekBack10().catch(console.error);
          break;

        case 'l':
          this.controller.seekForward10().catch(console.error);
          break;

        case 'f':
          this.playerState.toggleFullscreen().catch(console.error);
          break;
      }
    }, {passive: true});
  }

  private shouldHandleEvent(event: KeyboardEvent): boolean {
    return !this.isTargetTextInput(event) && !this.isSpecialKeyActive(event);
  }

  private isTargetTextInput(event: KeyboardEvent): boolean {
    return event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || (event.target instanceof HTMLElement && event.target.isContentEditable);
  }

  private isSpecialKeyActive(event: KeyboardEvent): boolean {
    return event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.isComposing;
  }
}
