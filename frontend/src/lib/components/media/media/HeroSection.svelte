<script lang="ts">
  import { onMount } from 'svelte';
  import IconChevronDown from 'virtual:icons/tabler/chevron-down';
  import IconChevronUp from 'virtual:icons/tabler/chevron-up';
  import IconPlay from 'virtual:icons/tabler/player-play-filled';
  import IconRotate from 'virtual:icons/tabler/rotate';

  let { mediaId, title, synopsis, hasClearLogo, nextMediaItem }: {
    mediaId: string,
    title: string,
    synopsis: string | null,
    hasClearLogo: boolean,
    nextMediaItem: {
                     id: string,
                     episodeNumber: number,
                     title: string,
                     synopsis: string | null,
                     durationInSeconds: number,
                     watchProgress: {
                                      inSeconds: number,
                                      asPercentage: number,
                                    } | null,
                   } | null
  } = $props();

  let synopsisContainerRef: HTMLElement | null = $state(null);

  let isSynopsisOverflowing = $state(false);
  let isSynopsisExpanded = $state(false);

  function toggleSynopsisExpand() {
    isSynopsisExpanded = !isSynopsisExpanded;
  }

  function checkSynopsisOverflow(): void {
    if (synopsisContainerRef != null) {
      isSynopsisOverflowing = isSynopsisExpanded || synopsisContainerRef.scrollHeight > synopsisContainerRef.clientHeight;
    }
  }

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const hrs = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return hrs > 0 ? `${hrs}h ${remainingMins}m` : `${remainingMins}m`;
  }

  onMount(() => {
    checkSynopsisOverflow();
    window.addEventListener('load', checkSynopsisOverflow, { passive: true });
    window.addEventListener('resize', checkSynopsisOverflow, { passive: true });

    return () => {
      window.removeEventListener('load', checkSynopsisOverflow);
      window.removeEventListener('resize', checkSynopsisOverflow);
    };
  });
</script>

<div class="hero-backdrop"
     style="background-image: url('/api/_frontend/media-new/{mediaId}/backdrop.jpeg'); background-image: image-set(
       '/api/_frontend/media-new/{mediaId}/backdrop.avif' type('image/avif'),
       '/api/_frontend/media-new/{mediaId}/backdrop.jpeg' type('image/jpeg')
     )"
>
  <div class="hero-overlay">
    <div class="hero-content">
      <h1 class="hero-title"
          class:visually-hidden={hasClearLogo}
      >{title}</h1>
      {#if hasClearLogo}
        <picture>
          <source srcset="/api/_frontend/media-new/{mediaId}/logo.avif" type="image/avif" />
          <img src="/api/_frontend/media-new/{mediaId}/logo.png" class="hero-logo" alt="" title={title} loading="eager" role="presentation" aria-hidden="true">
        </picture>
      {/if}

      <!-- FIXME: Fill with real data -->
      <div class="hero-meta">
        <span>YYYY</span>
        <span class="rating-badge">FSK -1</span>
        <!-- <span>1h 54m</span> -->
        <span class="badge bg-secondary">40K Hyper HD</span>
      </div>

      {#if synopsis != null}
        <p class="hero-synopsis"
           style="white-space: pre-line"
           class:expanded={isSynopsisExpanded}
           bind:this={synopsisContainerRef}
        >{synopsis}</p>
        {#if isSynopsisOverflowing}
          <button
            onclick={toggleSynopsisExpand}
            class="read-more-btn"
          >
            {#if isSynopsisExpanded}
              Show Less <IconChevronUp class="icon" role="presentation" />
            {:else}
              Read More <IconChevronDown class="icon" role="presentation" />
            {/if}
          </button>
        {/if}
      {/if}

      {#if nextMediaItem != null}
        <div class="mb-4" style="max-width: 400px">
          <div class="d-flex justify-content-between text-secondary small mb-1">
            <span>Resume Episode {nextMediaItem.episodeNumber} ({formatDuration(nextMediaItem.durationInSeconds - (nextMediaItem.watchProgress?.inSeconds ?? 0))} remaining)</span>
            <span>{formatDuration(nextMediaItem.watchProgress?.inSeconds ?? 0)} watched</span>
          </div>
          <div class="progress progress-container">
            <div class="progress-bar bg-danger"
                 role="progressbar"
                 style:width="{nextMediaItem.watchProgress != null ? Math.floor(nextMediaItem.watchProgress.asPercentage * 100) : 0}%"
                 aria-valuenow={nextMediaItem.watchProgress != null ? Math.floor(nextMediaItem.watchProgress.asPercentage * 100) : 0}
                 aria-valuemin="0"
                 aria-valuemax="100"></div>
          </div>
        </div>

        <div class="action-buttons">
          <a
            href="/api/_frontend/media/player-session/start-watching?mediaItem={encodeURIComponent(nextMediaItem.id)}&startOffset=auto"
            class="btn-action">
            <IconPlay class="icon" role="presentation" />
            Resume
          </a>

          <a
            href="/api/_frontend/media/player-session/start-watching?mediaItem={encodeURIComponent(nextMediaItem.id)}&startOffset=0"
            class="btn-action btn-action-secondary">
            <IconRotate class="icon" role="presentation" />
            Start Over
          </a>
        </div>
      {/if}
    </div>
  </div>
</div>


<style>
  .hero-backdrop {
    position:            relative;
    height:              70vh;
    width:               100%;
    background-size:     cover;
    background-position: center;
  }

  .hero-overlay {
    position:    absolute;
    top:         0;
    left:        0;
    width:       100%;
    height:      100%;
    background:  linear-gradient(to right, var(--primary-bg) 0%, var(--hero-overlay-mid) 40%, var(--hero-overlay-end) 100%),
                 linear-gradient(to top, var(--primary-bg) 0%, transparent 50%);
    display:     flex;
    align-items: center;
    padding:     0 60px;
  }

  .hero-content {
    max-width: 600px;
    z-index:   10;
  }

  .hero-logo {
    max-width:     300px;
    margin-bottom: 20px;
  }

  .hero-title {
    font-size:     3.5rem;
    font-weight:   800;
    margin-bottom: 10px;
    line-height:   1.1;
  }

  .hero-meta {
    display:       flex;
    align-items:   center;
    gap:           15px;
    margin-bottom: 20px;
    font-size:     1rem;
    color:         var(--text-muted);
  }

  .progress-container {
    height:           4px;
    background-color: rgba(255, 255, 255, 0.2);
  }

  .rating-badge {
    border:        1px solid var(--text-muted);
    padding:       2px 6px;
    border-radius: 4px;
    font-size:     0.8rem;
  }

  .hero-synopsis {
    font-size:          1.1rem;
    color:              var(--text-muted);
    max-width:          600px;
    margin-bottom:      2rem;
    display:            -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp:         3;
    -webkit-box-orient: vertical;
    overflow:           hidden;
    transition:         all 0.3s ease;
  }

  .hero-synopsis.expanded {
    -webkit-line-clamp: unset;
    line-clamp:         unset;
  }

  .read-more-btn {
    background:    none;
    border:        none;
    color:         var(--text-secondary);
    padding:       0;
    font-size:     0.9rem;
    cursor:        pointer;
    margin-top:    -1.5rem;
    /* Pull up closer to text */
    margin-bottom: 2rem;
    display:       flex;
    align-items:   center;
    gap:           5px;
  }

  .read-more-btn:hover {
    color: var(--text-primary);
  }

  .action-buttons {
    display: flex;
    gap:     15px;
  }

  .btn-action {
    background-color: var(--text-primary);
    color:            var(--text-inverse);
    border:           none;
    padding:          12px 30px;
    font-weight:      600;
    border-radius:    6px;
    display:          flex;
    align-items:      center;
    gap:              10px;
    text-decoration:  none;
    transition:       background-color .2s;
    backdrop-filter:  blur(5px);
  }

  .btn-action:hover {
    background-color: var(--text-secondary);
  }

  .btn-action.btn-action-secondary {
    background-color: var(--btn-secondary-bg);
    color:            var(--text-primary);
    padding:          12px 20px;
  }

  .btn-action.btn-action-secondary:hover {
    background-color: var(--btn-secondary-hover);
  }

  .hero-backdrop {
    height: 85vh;
  }

  /* Mobile Responsiveness */
  @media (max-width: 768px) {
    .hero-title {
      font-size: 2.5rem;
    }

    .hero-overlay {
      padding:     0 20px 40px;
      background:  linear-gradient(to top, var(--primary-bg) 10%, rgba(15, 16, 20, 0.5) 100%);
      align-items: flex-end;
    }

    .hero-backdrop {
      height: 60vh;
    }
  }
</style>
