'use strict';

class ContextMenu {
  /**
   * @type {HTMLElement|null}
   * @private
   */
  currentMenuElement = null;
  /**
   * @type {HTMLElement|null}
   * @private
   */
  currentTargetElement = null;

  /**
   * @param {string} querySelector
   * @param {(target: HTMLElement) => {text: string, icon?: string, clickListener: (event: MouseEvent) => void}[]} menuProvider
   */
  constructor(querySelector, menuProvider) {
    for (const element of document.querySelectorAll(querySelector)) {
      element.addEventListener('contextmenu', (event) => {
        // TODO: Allow to open browser context menu if clicking on the same element again and cursor is close to the menu
        event.preventDefault();

        const menuEntries = menuProvider(event.currentTarget);
        if (menuEntries.length > 0) {
          this.show(event, menuEntries);
        }
      });
    }

    document.addEventListener('click', () => this.close());
  }

  /**
   * @param {MouseEvent} event
   * @param {{text: string, icon?: string, clickListener: (event: MouseEvent) => void}[]} entries
   */
  show(event, entries) {
    this.close();

    const menu = document.createElement('div');
    menu.classList.add('context-menu');
    menu.style.top = `${event.pageY}px`;
    menu.style.left = `${event.pageX}px`;

    for (const entry of entries) {
      const menuItem = document.createElement('div');
      menuItem.classList.add('context-menu-item');

      if (entry.clickListener) {
        menuItem.addEventListener('click', entry.clickListener);
      }

      if (entry.icon) {
        const icon = document.createElement('span');
        icon.classList.add('material-icons', 'icon-inline');
        icon.innerText = entry.icon;
        menuItem.appendChild(icon);
      }

      const text = document.createElement('span');
      text.innerText = entry.text;
      menuItem.appendChild(text);

      menu.appendChild(menuItem);
    }

    this.currentTargetElement = event.currentTarget;
    this.currentMenuElement = menu;
    document.body.appendChild(menu);

    const menuRect = menu.getBoundingClientRect();
    if (menuRect.right > window.innerWidth) {
      menu.style.left = `${event.pageX - menuRect.width}px`;
    }
    if (menuRect.bottom > window.innerHeight) {
      menu.style.top = `${event.pageY - menuRect.height}px`;
    }
  }

  close() {
    this.currentTargetElement = null;

    if (this.currentMenuElement != null) {
      this.currentMenuElement.remove();
      this.currentMenuElement = null;
    }
  }
}
