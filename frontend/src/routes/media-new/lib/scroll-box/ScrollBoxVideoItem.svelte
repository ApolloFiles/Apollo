<script lang="ts">
  let {
    videoHeading,
    videoSubheading,
    videoWatchProgressPercentage = 0,
    videoThumbnailSrc,
    videoThumbnailWidth = '',
    videoThumbnailHeight = ''
  }: {
    videoHeading: string,
    videoSubheading: string,
    videoWatchProgressPercentage: number,
    videoThumbnailSrc: string,
    videoThumbnailWidth?: string | number,
    videoThumbnailHeight?: string | number
  } = $props();

  videoWatchProgressPercentage = Math.min(100, Math.max(0, videoWatchProgressPercentage));

  // TODO: Have a fallback/default image (maybe set as css background-image?)
</script>

<article class="video-thumbnail-card">
  <div class="card">
    <img src={videoThumbnailSrc} width={videoThumbnailWidth} height={videoThumbnailHeight} alt="">
    <div class="playback-progress" style="width: {videoWatchProgressPercentage}%"></div>
    <div class="card-body pt-2 pb-2">
      <h5 class="card-title mb-0" title={videoHeading}>{videoHeading}</h5>
      <p class="card-text" title="{videoSubheading}"><small class="text-body-secondary">{videoSubheading}</small></p>
    </div>
  </div>
</article>

<style>
  .video-thumbnail-card {
    aspect-ratio:  16 / 9;
    min-width:     20vw;
    height:        16rem;

    white-space:   nowrap;
    overflow:      hidden;
    text-overflow: ellipsis;
  }

  .video-thumbnail-card img {
    width:                   100%;
    height:                  100%;
    object-fit:              cover;
    border-top-left-radius:  0.5rem;
    border-top-right-radius: 0.5rem;
  }

  .video-thumbnail-card .card {
    width:         100%;
    height:        100%;
    border-radius: 0.5rem;
  }

  .playback-progress {
    width:            0;
    height:           0.375rem;
    background-color: #ea2d63;
  }

  @media only screen and (max-width: 768px) {
    .video-thumbnail-card {
      min-width: 70vw;
    }
  }

  @media only screen and (max-width: 992px) {
    .video-thumbnail-card {
      min-width: 35vw;
    }
  }
</style>
