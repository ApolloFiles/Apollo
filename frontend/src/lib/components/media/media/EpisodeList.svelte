<script lang="ts">
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

  const selectedSeasonNumber = $state(seasons[0].seasonNumber);
  const episodesForSelectedSeason = $derived(
    seasons.find(s => s.seasonNumber === selectedSeasonNumber)?.episodes ?? [],
  );
  const episodeToWatchNext = $derived(episodesForSelectedSeason.find(e => e.id === nextEpisodeIdToWatch) ?? null);
</script>

<div class="d-flex justify-content-between align-items-center mb-4">
  <h3 class="m-0">Episodes</h3>
  <select class="form-select bg-dark text-white border-secondary"
          style="width: auto"
          aria-label="Select Season">
    {#each seasons as season}
      <option selected={season.seasonNumber === selectedSeasonNumber}>Season {season.seasonNumber}</option>
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
