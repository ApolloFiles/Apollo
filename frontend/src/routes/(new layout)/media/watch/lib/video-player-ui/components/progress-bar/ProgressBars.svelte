<script lang="ts">
  export let remoteBufferedPercentage: number;
  export let localBufferedPercentage: number;
  export let displayedPercentage: number;
</script>

<div class="progress-bar total"></div>
<div class="progress-bar remote-buffered" style:width="{remoteBufferedPercentage}%"></div>
<div class="progress-bar local-buffered" style:width="{localBufferedPercentage}%"></div>
<div class="progress-bar watched" style:width="{displayedPercentage}%"></div>

<style>
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
</style>
