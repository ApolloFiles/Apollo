<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import type SubtitleTrack from '../../client-side/backends/subtitles/SubtitleTrack';

  let {
    children,
    menuVisible = $bindable(),
    menuItems,
    activeItem = $bindable(),
    activeItemId = $bindable(),
    onSelect,
    onMenuOpen,
  }: {
    children: Snippet,

    menuVisible: boolean,
    menuItems: { id: string, label: string }[],
    activeItem?: SubtitleTrack | null,
    activeItemId?: string | null,

    onSelect: (id: string) => void,
    onMenuOpen: () => void,
  } = $props();

  function handleSelect(id: string): void {
    menuVisible = false;
    if (activeItem !== undefined) {
      activeItem = (menuItems.find(item => item.id === id) || null) as any; // FIXME
    } else {
      activeItemId = id;
    }
    onSelect(id);
  }

  function toggleMenu(): void {
    if (!menuVisible) {
      onMenuOpen();
    }
    menuVisible = !menuVisible;
  }

  function handleClickOutside(event: MouseEvent): void {
    if (!(event.target instanceof HTMLElement)) {
      return;
    }
    if (!menuVisible || event.target.closest('.menu-box-container')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    menuVisible = false;
  }

  onMount(() => {
    document.addEventListener('click', handleClickOutside);

    return () => document.removeEventListener('click', handleClickOutside);
  });
</script>

<div class="menu-box-container">
  <button
    class="menu-button"
    onclick={toggleMenu}
  >
    {@render children()}
  </button>

  {#if menuVisible}
    <div class="menu-box">
      {#each menuItems as menuItem}
        <button
          type="button"
          role="menuitem"
          class="menu-box-item"
          class:active={activeItem ? (menuItem.id === activeItem.id) : (menuItem.id === activeItemId)}
          onclick={() => handleSelect(menuItem.id)}
        >
          {menuItem.label}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .menu-button {
    background:      transparent;
    color:           white;
    border:          none;
    padding:         8px;
    cursor:          pointer;
    font-size:       1.2rem;
    width:           40px;
    height:          40px;
    display:         flex;
    align-items:     center;
    justify-content: center;
    border-radius:   50%;
    transition:      background-color 0.2s;
  }

  .menu-button:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }

  .menu-box {
    position:         absolute;
    bottom:           50px;
    right:            40px;
    background-color: #1a1a1a; /* Slightly lighter than black */
    border:           1px solid rgba(255, 255, 255, 0.1); /* Subtle border */
    box-shadow:       0 4px 6px rgba(0, 0, 0, 0.3); /* Subtle shadow for depth */
    border-radius:    4px;
    padding:          4px 0;
    min-width:        200px;
    max-height:       300px;
    overflow-y:       auto;
    z-index:          1000;

    scrollbar-width:  thin; /* Firefox */
    scrollbar-color:  rgba(255, 255, 255, 0.3) transparent; /* Firefox */
  }

  /* Webkit (Chrome, Safari, Edge) scrollbar styling */
  .menu-box::-webkit-scrollbar {
    width: 6px;
  }

  .menu-box::-webkit-scrollbar-track {
    background: transparent;
  }

  .menu-box::-webkit-scrollbar-thumb {
    background-color: rgba(255, 255, 255, 0.3);
    border-radius:    3px;
  }

  .menu-box-item {
    padding:              6px 12px;
    color:                white;
    cursor:               pointer;
    transition:           background-color 0.2s;
    display:              flex;
    align-items:          center;
    gap:                  8px;
    background:           none;
    border:               none;
    width:                100%;
    text-align:           left;
    font-size:            0.9rem;
    font-variant-numeric: tabular-nums;
  }

  .menu-box-item:hover {
    background-color: #2a2a2a;
  }

  .menu-box-item.active {
    background-color: #333;
    font-weight:      500;
  }
</style>
