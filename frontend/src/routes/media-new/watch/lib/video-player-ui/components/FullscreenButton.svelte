<script lang="ts">
  import {onMount} from 'svelte';

  let isFullscreen = $state(typeof document !== 'undefined' && document.fullscreenElement != null);

  export function toggleFullscreen(): void {
    if (document.fullscreenElement != null) {
      document.exitFullscreen?.()
        .catch((err) => console.error('Error exiting fullscreen:', err));
      return;
    }

    const htmlElement = document.querySelector('main.watch-main');
    htmlElement!.requestFullscreen?.()
      .catch((err) => console.error('Error enabling fullscreen:', err));
  }

  function handleFullscreenChange() {
    isFullscreen = document.fullscreenElement != null;
  }

  onMount(() => {
    document.addEventListener('fullscreenchange', handleFullscreenChange, {passive: true});

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  });
</script>

<button class="fullscreen-button" onclick={toggleFullscreen}>
  {isFullscreen ? '↙' : '⛶'}
</button>


<style>
  .fullscreen-button {
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

  .fullscreen-button:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }
</style>
