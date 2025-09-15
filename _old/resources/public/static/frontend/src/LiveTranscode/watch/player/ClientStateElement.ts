import { formatPlaybackTime } from '../PlaybackTimeFormatter';

export default class ClientStateElement {
  private readonly clientElement: HTMLElement;

  private lastTime: number = -1;

  constructor(displayName: string) {
    const template = document.querySelector<HTMLTemplateElement>('#syncedClientsContainer template')!;
    const clonedTemplate = template.content.cloneNode(true);

    document.getElementById('syncedClientList')!.appendChild(clonedTemplate);
    this.clientElement = document.getElementById('syncedClientList')!.lastElementChild as HTMLElement;

    this.updateName(displayName);
    this.updateTime(0);
  }

  updateName(displayName: string): void {
    this.clientElement.querySelector('[data-template-content="displayName"]')!.textContent = displayName;
  }

  updateTime(time: number): void {
    if (this.lastTime === time) {
      return;
    }

    this.clientElement.querySelector('[data-template-content="currentTimes"]')!.textContent = formatPlaybackTime(time);
    this.lastTime = time;
  }

  updateSuperMaster(isSuperMaster: boolean): void {
    this.clientElement.querySelector<HTMLElement>('[data-template-content="superMaster"]')!.style.display = isSuperMaster ? '' : 'none';
  }

  destroy(): void {
    this.clientElement.remove();
  }
}
