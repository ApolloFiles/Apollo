<script lang="ts">
  const {volume = $bindable(), muted = $bindable()}: { volume: number, muted: boolean } = $props();
</script>

<button class="control-button">{muted ? '🔇' : '🔊'}</button>
<div class="volume-slider-container">
  <div class="volume-slider">
    <div class="volume-level" style:width="{muted ? 0 : volume * 100}%"></div>
    <div class="volume-handle" style:left="{muted ? 0 : volume * 100}%"></div>
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

  .volume-slider-container:hover .volume-handle {
    transform: translate(-50%, -50%) scale(1.5);
  }

  .volume-slider-container:hover .volume-slider {
    height: 6px;
  }
</style>
