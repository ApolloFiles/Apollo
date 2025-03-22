<script lang="ts">
  const {}: {} = $props();

  function formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  function handleSeekHover(event: MouseEvent): void {
    const container = event.currentTarget as HTMLElement;
    const preview = container.querySelector('.seek-preview') as HTMLElement;
    const timeDisplay = preview.querySelector('.seek-preview-time') as HTMLElement;

    // Calculate position relative to container
    const rect = container.getBoundingClientRect();
    const position = Math.max(0, Math.min(event.clientX - rect.left, rect.width));
    const percentage = position / rect.width;

    // Calculate time (assuming 10-minute video for now)
    const totalSeconds = 10 * 60; // FIXME
    const currentSeconds = totalSeconds * percentage;

    // Update preview position and time
    preview.style.display = 'block';
    preview.style.left = `${position}px`;
    timeDisplay.textContent = formatTime(currentSeconds);
  }

  function handleSeekLeave(event: MouseEvent): void {
    const container = event.currentTarget as HTMLElement;
    const preview = container.querySelector('.seek-preview') as HTMLElement;
    preview.style.display = 'none';
  }
</script>

<div class="seek-row">
  <span class="timestamp">0:00</span>
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <!-- TODO: Make sure to update aria-valuemin etc. -->
  <div
    class="progress-bar-container"
    onmousemove={handleSeekHover}
    onmouseleave={handleSeekLeave}
    role="slider"
    aria-label="Video progress"
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow="10"
  >
    <div class="progress-bar total"></div>
    <div class="progress-bar remote-buffered" style="width: 50%"></div>
    <div class="progress-bar local-buffered" style="width: 20%"></div>
    <div class="progress-bar watched" style="width: 10%"></div>
    <div class="seek-handle" style="left: 10%"></div>

    <div class="seek-preview" style="display: none">
      <img src="example.png" alt="Preview" class="seek-preview-thumbnail">
      <div class="seek-preview-time">05:12</div>
    </div>
  </div>
  <span class="timestamp">10:00</span>
</div>


<style>
  .seek-row {
    display:     flex;
    align-items: center;
    gap:         15px;
    width:       100%;
  }

  .progress-bar-container {
    flex-grow: 1;
    position:  relative;
    cursor:    pointer;
    padding:   14px 0;
  }

  .progress-bar {
    position:      absolute;
    height:        5px;
    top:           50%;
    transform:     translateY(-50%);
    left:          0;
    border-radius: 2px;
  }

  .progress-bar.total {
    width:            100%;
    background-color: rgba(255, 255, 255, 0.2);
  }

  .progress-bar.remote-buffered {
    background-color: rgba(128, 128, 255, 0.4);
  }

  .progress-bar.local-buffered {
    background-color: rgba(255, 255, 255, 0.6);
  }

  .progress-bar.watched {
    background-color: #ff3e3e;
  }

  .timestamp {
    color:       white;
    font-family: monospace;
    font-size:   0.9rem;
    min-width:   45px;
  }

  .seek-handle {
    position:         absolute;
    width:            14px;
    height:           14px;
    background-color: #ff3e3e;
    border-radius:    50%;
    top:              50%;
    transform:        translate(-50%, -50%);
    cursor:           grab;
    transition:       transform 0.1s;
  }

  .progress-bar-container:hover .seek-handle {
    transform: translate(-50%, -50%) scale(1.25);
  }

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
