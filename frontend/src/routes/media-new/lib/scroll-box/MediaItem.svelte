<script lang="ts">
  const {
    mediaHeading,
    mediaSubheading,
    mediaThumbnailSrc,
    mediaThumbnailWidth = '',
    mediaThumbnailHeight = ''
  }: {
    mediaHeading: string,
    mediaSubheading: string,
    mediaThumbnailSrc: string,
    mediaThumbnailWidth?: string | number,
    mediaThumbnailHeight?: string | number
  } = $props();

  // TODO: Have a fallback/default image (maybe set as css background-image?)
</script>

<article class="video-thumbnail-card">
  <div class="card">
    <img src={mediaThumbnailSrc} width={mediaThumbnailWidth} height={mediaThumbnailHeight} alt="">
    <div class="card-body">
      <h5 class="card-title mb-0">{mediaHeading}</h5>
      <p class="card-text"><small class="text-body-secondary">{mediaSubheading}</small></p>
    </div>
  </div>
</article>

<style>
  .video-thumbnail-card {
    display:      inline-block;
    text-wrap:    balance;
    padding:      .5rem;
    max-height:   45vh;
    max-width:    14vw;
    aspect-ratio: 0.75 / 1;
  }

  .video-thumbnail-card img {
    width:                   100%;
    height:                  100%;
    object-fit:              contain;
    border-top-left-radius:  0.5rem;
    border-top-right-radius: 0.5rem;
  }

  .video-thumbnail-card .card {
    width:         100%;
    height:        100%;
    border-radius: 0.5rem;
  }
</style>
