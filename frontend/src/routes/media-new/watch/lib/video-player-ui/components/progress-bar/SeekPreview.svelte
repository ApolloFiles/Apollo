<script lang="ts">
  const { visible, position, time }: { visible: boolean, position: number, time: number } = $props();

  function formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
</script>

<div class="seek-preview"
     style:display="{visible ? 'block' : 'none'}"
     style:left="clamp(5px, {position}px, calc(100% - 5px))"
>
  <img src="example.png" alt="Preview" class="seek-preview-thumbnail">
  <div class="seek-preview-time">{formatTime(time)}</div>
</div>

<style>
  .seek-preview {
    position:         absolute;
    bottom:           25px;
    transform:        translateX(-50%);
    background-color: rgba(0, 0, 0, 0.9);
    border-radius:    4px;
    padding:          4px;
    pointer-events:   none;
    z-index:          1000;
  }

  .seek-preview-thumbnail {
    width:         160px;
    height:        90px;
    object-fit:    cover;
    border-radius: 2px;
    display:       block;
  }

  .seek-preview-time {
    color:       white;
    text-align:  center;
    font-family: monospace;
    font-size:   0.9rem;
    margin-top:  4px;
  }
</style>
