<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import EpisodeCard from '$lib/components/media/media/EpisodeCard.svelte';

  let { nextEpisodeIdToWatch, seasons }: {
    nextEpisodeIdToWatch: string | null,
    seasons: {
      seasonNumber: number,
      episodes: {
        id: string,
        episodeNumber: number,
        title: string,
        synopsis: string | null,
        durationInSeconds: number,
        watchProgress: {
                         inSeconds: number,
                         asPercentage: number,
                       } | null,
      }[],
    }[],
  } = $props();

  let selectedSeasonIndex = $state(determineInitialSeasonIndex());

  const episodesForSelectedSeason = $derived(seasons[selectedSeasonIndex]?.episodes ?? []);
  const episodeToWatchNext = $derived(episodesForSelectedSeason.find(e => e.id === nextEpisodeIdToWatch) ?? null);

  function determineInitialSeasonIndex(): number {
    const queryParamValue = parseInt(page.url.searchParams.get('s') || '1', 10);

    const querySeasonIndex = seasons.findIndex(s => s.seasonNumber === queryParamValue);
    if (querySeasonIndex !== -1) {
      return querySeasonIndex;
    }

    const firstSeason = seasons.findIndex(s => s.seasonNumber === 1);
    if (firstSeason !== -1) {
      return firstSeason;
    }

    return 0;
  }

  function setSelectedSeasonIndex(index: number): void {
    selectedSeasonIndex = index;
    const selectedSeasonNumber = seasons[index]?.seasonNumber;

    const url = new URL(window.location.href);

    if (typeof selectedSeasonNumber !== 'number') {
      if (url.searchParams.has('s')) {
        url.searchParams.delete('s');
        goto(url.href, { replaceState: true, keepFocus: true, noScroll: true });
      }
      return;
    }

    url.searchParams.set('s', selectedSeasonNumber.toString());
    goto(url.href, { replaceState: true, keepFocus: true, noScroll: true });
  }
</script>

<div class="d-flex justify-content-between align-items-center mb-4">
  <h2 class="h3 m-0">Episodes</h2>
  <select class="form-select bg-dark text-white border-secondary"
          style="width: auto"
          aria-label="Select Season"
          onchange={(event) => setSelectedSeasonIndex(Math.max(event.currentTarget.selectedIndex, 0))}
  >
    {#each seasons as season, index}
      <option selected={index === selectedSeasonIndex}>Season {season.seasonNumber}</option>
    {/each}
  </select>
</div>

<div class="d-flex flex-column gap-3">
  {#each episodesForSelectedSeason as episode}
    <EpisodeCard
      mediaItemId={episode.id}
      episodeNumber={episode.episodeNumber}
      title={episode.title}
      synopsis={episode.synopsis}
      isNextToWatch={episode.id === episodeToWatchNext?.id}
      durationInSeconds={episode.durationInSeconds}
      watchProgress={episode.watchProgress}
    />
  {/each}
</div>
