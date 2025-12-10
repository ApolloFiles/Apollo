<script lang="ts">
  import IconPlay from 'virtual:icons/tabler/player-play-filled';

  let {
    libraryId,
    mediaId,
    mediaItemId,
    episodeNumber,
    title,
    synopsis,
    isNextToWatch,
    durationInSeconds,
    watchProgress,
  }: {
    libraryId: string,
    mediaId: string,
    mediaItemId: string,
    episodeNumber: number,
    title: string,
    synopsis: string | null,
    isNextToWatch: boolean,
    durationInSeconds: number,
    watchProgress: {
                     inSeconds: number,
                     asPercentage: number,
                   } | null,
  } = $props();

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const hrs = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return hrs > 0 ? `${hrs}h ${remainingMins}m` : `${remainingMins}m`;
  }
</script>

<a href="/api/_frontend/media/player-session/start-watching?mediaItem={encodeURIComponent(mediaItemId)}&startOffset=auto"
   class="episode-card d-flex gap-3 p-3 rounded-3"
   class:active={isNextToWatch}
   aria-label="Play Episode {episodeNumber}: {title}">
  <div class="episode-thumbnail">
    <picture>
      <source srcset="/api/_frontend/media-new/item/{mediaItemId}/thumbnail.avif" type="image/avif" />
      <img src="/api/_frontend/media-new/item/{mediaItemId}/thumbnail.jpeg" alt="" loading="lazy" />
    </picture>
    <div class="play-overlay"><IconPlay class="icon" /></div>
    {#if watchProgress != null}
      <div class="episode-progress">
        <div class="episode-progress-bar" style="width: {Math.floor(watchProgress.asPercentage * 100)}%"></div>
      </div>
    {/if}
  </div>
  <div class="flex-grow-1">
    <div class="d-flex justify-content-between">
      <h5 class="mb-1 episode-title">{episodeNumber}. {title}</h5>
      <span class="text-secondary">{formatDuration(durationInSeconds)}</span>
    </div>
    {#if synopsis != null}
      <p class="text-secondary small mb-0 line-clamp-2">{synopsis}</p>
    {/if}
  </div>
</a>

<style>
  .episode-card {
    text-decoration: none;
    color:           inherit;
    transition:      background-color 0.2s;
    cursor:          pointer;
    border:          1px solid transparent;
    border-left:     4px solid transparent;
  }

  .episode-card:hover {
    background-color: var(--hover-bg);
  }

  .episode-card.active {
    background-color:  var(--active-bg);
    border-left-color: var(--accent-color);
  }

  .episode-card.active .episode-title {
    font-weight: bold;
    color:       white;
  }

  .episode-thumbnail {
    position:    relative;
    width:       160px;
    flex-shrink: 0;
  }

  .episode-thumbnail img {
    width:         100%;
    border-radius: 8px;
  }

  .episode-progress {
    position:                   absolute;
    bottom:                     0;
    left:                       0;
    width:                      100%;
    height:                     4px;
    background:                 rgba(0, 0, 0, 0.5);
    border-bottom-left-radius:  8px;
    border-bottom-right-radius: 8px;
    overflow:                   hidden;
  }

  .episode-progress-bar {
    height:           100%;
    background-color: var(--accent-color);
  }

  .play-overlay {
    position:        absolute;
    top:             50%;
    left:            50%;
    transform:       translate(-50%, -50%);
    background:      rgba(0, 0, 0, 0.6);
    width:           40px;
    height:          40px;
    border-radius:   50%;
    display:         flex;
    align-items:     center;
    justify-content: center;
    opacity:         0;
    transition:      opacity 0.2s;
  }

  .episode-card:hover .play-overlay {
    opacity: 1;
  }
</style>
