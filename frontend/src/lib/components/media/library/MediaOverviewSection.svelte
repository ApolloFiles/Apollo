<script lang="ts">
  let { title, viewAllLink, items }: {
    title: string,
    viewAllLink?: string,
    items: {
      title: string,
      libraryId: string,
      mediaId: string,
      watchProgressPercentage?: number,
    }[],
  } = $props();
</script>

<section>
  <div class="section-title">
    <span>{title}</span>
    {#if viewAllLink != null}
      <a href={viewAllLink} class="text-decoration-none text-secondary fs-6">View All&nbsp;<i
        class="fas fa-chevron-right ms-1"></i></a>
    {/if}
  </div>

  <div class="media-scroller">
    {#each items as item}
      <a href="/media-new/{item.libraryId}/{item.mediaId}" class="media-card">
        <picture class="s-BUJUVtHZo5xi">
<!--          <source srcset="/api/_frontend/media/{item.libraryId}/{item.mediaId}/poster.avif" type="image/avif" />-->
          <img src="/api/_frontend/media/{item.libraryId}/{item.mediaId}/poster.jpg" alt="" />
        </picture>

        {#if item.watchProgressPercentage != null}
          <div class="progress mt-2 progress-bar-container">
            <div class="progress-bar bg-danger"
                 role="progressbar"
                 aria-valuemin="0"
                 aria-valuemax="100"
                 aria-valuenow={Math.floor(item.watchProgressPercentage * 100)}
                 style:width="{Math.floor(item.watchProgressPercentage * 100)}%"
                 aria-label="{Math.floor(item.watchProgressPercentage * 100)}% watched"
            ></div>
          </div>
        {/if}

        <div class="media-overlay">
          <div class="media-title">{item.title}</div>
          <div class="media-meta">2024 • Action • 1h 54m</div>
        </div>
      </a>
    {/each}
  </div>
</section>


<style>
  .section-title {
    font-size:       1.2rem;
    font-weight:     600;
    margin-bottom:   15px;
    margin-top:      30px;
    display:         flex;
    justify-content: space-between;
    align-items:     center;
  }

  .media-scroller {
    display:         flex;
    overflow-x:      auto;
    gap:             20px;
    padding-bottom:  20px;
    scroll-behavior: smooth;
  }

  .media-card {
    flex:            0 0 auto;
    width:           200px;
    position:        relative;
    border-radius:   12px;
    overflow:        hidden;
    cursor:          pointer;
    transition:      transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    text-decoration: none;
    color:           inherit;
    display:         block;
  }

  .media-card:hover {
    transform:  scale(var(--card-hover-scale));
    z-index:    10;
    box-shadow: 0 10px 20px var(--card-shadow);
    color:      inherit;
  }

  .media-card img {
    width:         100%;
    height:        300px;
    object-fit:    cover;
    border-radius: 12px;
  }

  .media-overlay {
    position:        absolute;
    top:             0;
    left:            0;
    width:           100%;
    height:          100%;
    background:      linear-gradient(to top, var(--overlay-gradient-start) 0%, rgba(0, 0, 0, 0) 50%);
    opacity:         0;
    transition:      opacity 0.3s ease;
    display:         flex;
    flex-direction:  column;
    justify-content: flex-end;
    padding:         15px;
  }

  .media-card:hover .media-overlay {
    opacity: 1;
  }

  .media-title {
    font-size:     1rem;
    font-weight:   600;
    margin-bottom: 5px;
  }

  .media-meta {
    font-size: 0.8rem;
    color:     var(--text-secondary);
  }

  .progress-bar-container {
    height:           4px;
    background-color: #333;
  }
</style>
