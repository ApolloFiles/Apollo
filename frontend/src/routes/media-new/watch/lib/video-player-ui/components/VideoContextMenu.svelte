<script lang="ts">
  import { onMount } from 'svelte';

  const { closeOtherMenus }: { closeOtherMenus: () => void } = $props();

  let showContextMenu = $state(false);
  let contextMenuPosition = $state({ x: 0, y: 0 });

  export function isVisible(): boolean {
    return showContextMenu;
  }

  function handleClickOutside(event: MouseEvent): void {
    if (!showContextMenu) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    showContextMenu = false;
  }

  function handleContextMenuEvent(event: MouseEvent): void {
    const targetIsPartOfContextMenu = (event.target as HTMLElement).closest('.context-menu') != null;
    const targetIsPartOfVideoPlayer = (event.target as HTMLElement).closest('main.watch-main .video-container') != null;

    if (!targetIsPartOfVideoPlayer) {
      showContextMenu = false;
      return;
    }
    if (targetIsPartOfContextMenu) {
      return;
    }

    if (showContextMenu) {
      showContextMenu = false;
      return;
    }

    event.preventDefault();
    closeOtherMenus();

    contextMenuPosition = { x: event.clientX, y: event.clientY };
    showContextMenu = true;
  }

  function handleContextMenuItem(): void {
    alert(1);
    showContextMenu = false;
  }

  onMount(() => {
    document.querySelector<HTMLElement>('main.watch-main')!.addEventListener('contextmenu', handleContextMenuEvent);
    document.addEventListener('click', handleClickOutside);

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  });
</script>

{#if showContextMenu}
  <div
    class="context-menu"
    style="left: {contextMenuPosition.x}px; top: {contextMenuPosition.y}px"
  >
    <button
      type="button"
      class="context-menu-item"
      onclick={handleContextMenuItem}
    >
      Alert(1)
    </button>
  </div>
{/if}

<style>
  .context-menu {
    position:         fixed;
    background-color: #1a1a1a;
    border:           1px solid rgba(255, 255, 255, 0.1);
    box-shadow:       0 4px 6px rgba(0, 0, 0, 0.3);
    border-radius:    4px;
    padding:          4px 0;
    min-width:        150px;
    z-index:          1000;
  }

  .context-menu-item {
    padding:     6px 12px;
    color:       white;
    cursor:      pointer;
    transition:  background-color 0.2s;
    display:     flex;
    align-items: center;
    gap:         8px;
    background:  none;
    border:      none;
    width:       100%;
    text-align:  left;
    font-size:   0.9rem;
  }

  .context-menu-item:hover {
    background-color: #2a2a2a;
  }
</style>
