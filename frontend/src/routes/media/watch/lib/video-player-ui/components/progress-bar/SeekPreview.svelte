<script lang="ts">
  import type VideoPlayerExtras from '../../../client-side/VideoPlayerExtras.svelte';

  const { visible, position, time, playerExtras }: {
    visible: boolean,
    position: number,
    time: number,
    playerExtras: VideoPlayerExtras
  } = $props();

  let seekThumbnail = $derived(playerExtras.seekThumbnails?.getCue(time) ?? null);

  function formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
</script>

<div class="seek-preview"
     style:display="{visible ? 'block' : 'none'}"
     style:left="clamp({((seekThumbnail?.width ?? 0) / 4) + 5}px, {position}px, calc(100% - {((seekThumbnail?.width ?? 0) / 4) + 5}px))"
>
  {#if seekThumbnail}
    <div class="seek-preview-thumbnail"
         style:background-image="url({seekThumbnail.uri})"
         style:width={seekThumbnail.width ? `${seekThumbnail.width}px` : ''}
         style:height={seekThumbnail.height ? `${seekThumbnail.height}px` : ''}
         style:background-position="-{seekThumbnail.x ?? 0}px -{seekThumbnail.y ?? 0}px"
    ></div>
  {/if}
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
