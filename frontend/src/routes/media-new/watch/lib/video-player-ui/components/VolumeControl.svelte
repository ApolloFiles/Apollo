<script lang="ts">
  import { onMount } from 'svelte';
  import IconVolumeFull from 'virtual:icons/tabler/volume';
  import IconVolume50 from 'virtual:icons/tabler/volume-2';
  import IconVolume0 from 'virtual:icons/tabler/volume-3';
  import IconVolumeOff from 'virtual:icons/tabler/volume-off';

  let { volume = $bindable(), muted = $bindable() }: { volume: number, muted: boolean } = $props();

  let sliderRef: HTMLDivElement;
  let isDragging = $state(false);

  let storeStateInLocalStorageDebounceTimeout: number | null = null;

  function preventSelection(event: Event): void {
    event.preventDefault();
  }

  function handleVolumeChange(clientX: number) {
    const rect = sliderRef.getBoundingClientRect();
    const newVolume = Math.max(0, Math.min((clientX - rect.left) / rect.width, 1));
    volume = newVolume;
    if (muted && newVolume > 0) {
      muted = false;
    }

    storeStateInLocalStorageDebounced();
  }

  function handleMouseDown(event: MouseEvent) {
    if (event.button !== 0) { // left mouse button only
      return;
    }

    isDragging = true;
    handleVolumeChange(event.clientX);

    document.addEventListener('selectstart', preventSelection);

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        handleVolumeChange(e.clientX);
      }
    };

    const handleMouseUp = () => {
      isDragging = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('selectstart', preventSelection);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  function toggleMute() {
    muted = !muted;
    storeStateInLocalStorageDebounced();
  }

  function storeStateInLocalStorage() {
    localStorage.setItem('apollo-video-player-volume', JSON.stringify({ volume, muted }));
  }

  function storeStateInLocalStorageDebounced() {
    if (storeStateInLocalStorageDebounceTimeout != null) {
      clearTimeout(storeStateInLocalStorageDebounceTimeout);
    }
    storeStateInLocalStorageDebounceTimeout = window.setTimeout(storeStateInLocalStorage, 500);
  }

  function restoreStateFromLocalStorage() {
    try {
      const storedVolumeData = JSON.parse(localStorage.getItem('apollo-video-player-volume') ?? '{}');
      if (typeof storedVolumeData.volume === 'number' && storedVolumeData.volume >= 0 && storedVolumeData.volume <= 1) {
        volume = storedVolumeData.volume;
      }
      if (typeof storedVolumeData.muted === 'boolean') {
        muted = storedVolumeData.muted;
      }
    } catch (error) {
      console.error('Failed to restore volume state from localStorage:', error);
      localStorage.removeItem('apollo-video-player-volume');
    }
  }

  onMount(() => {
    restoreStateFromLocalStorage();

    return () => {
      if (storeStateInLocalStorageDebounceTimeout != null) {
        clearTimeout(storeStateInLocalStorageDebounceTimeout);
        storeStateInLocalStorage();
      }
    };
  });
</script>

<button class="control-button"
        onclick={toggleMute}
        aria-label={muted ? "Unmute" : "Mute"}>
  {#if muted}
    <IconVolumeOff />
  {:else if volume > 0.5}
    <IconVolumeFull />
  {:else if volume > 0}
    <IconVolume50 />
  {:else}
    <IconVolume0 />
  {/if}
</button>
<div class="volume-slider-container">
  <div class="volume-slider"
       bind:this={sliderRef}
       onmousedown={handleMouseDown}
       role="slider"
       aria-label="Volume"
       aria-valuemin="0"
       aria-valuemax="100"
       aria-valuenow={muted ? 0 : Math.round(volume * 100)}
       tabindex="0">
    <div class="volume-level" style:width="{muted ? 0 : volume * 100}%"></div>
    <div class="volume-handle"
         style:left="{muted ? 0 : volume * 100}%"
         class:dragging={isDragging}
         role="presentation"></div>
  </div>
</div>

<style>
  .control-button {
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

  .control-button:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }

  .volume-slider-container {
    padding: 10px 0;
    width:   80px;
    cursor:  pointer;
  }

  .volume-slider {
    position:         relative;
    height:           4px;
    background-color: rgba(255, 255, 255, 0.3);
    border-radius:    2px;
  }

  .volume-level {
    position:         absolute;
    height:           100%;
    background-color: white;
    border-radius:    2px;
    left:             0;
    top:              0;
  }

  .volume-handle {
    position:         absolute;
    width:            12px;
    height:           12px;
    background-color: white;
    border-radius:    50%;
    top:              50%;
    transform:        translate(-50%, -50%);
    cursor:           grab;
    transition:       transform 0.1s;
  }

  .volume-handle.dragging {
    cursor:    grabbing;
    transform: translate(-50%, -50%) scale(1.5);
  }

  .volume-slider-container:hover .volume-handle {
    transform: translate(-50%, -50%) scale(1.5);
  }

  .volume-slider-container:hover .volume-slider {
    height: 6px;
  }
</style>
