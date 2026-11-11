import RenamedItemMatcher, { type MatchableItem } from '#src/plugins/official/media/library/scanner/RenamedItemMatcher.js';

const CODE_GEASS = 7230159496360001001n;
const CODE_GEASS_RENAMED = 7230159496360001002n;
const ARRIVAL = 7230159496360001003n;

function episode(mediaId: bigint, seasonNumber: number, episodeNumber: number, fileSizeInBytes: bigint | null): MatchableItem {
  return { mediaId, seasonNumber, episodeNumber, fileSizeInBytes };
}

function movie(mediaId: bigint, fileSizeInBytes: bigint | null): MatchableItem {
  return { mediaId, seasonNumber: null, episodeNumber: null, fileSizeInBytes };
}

describe(RenamedItemMatcher, () => {
  test('Pairs an episode with the missing one of the same show, season and episode, whatever its size', () => {
    const renamed = episode(CODE_GEASS, 1, 2, 1_503_238_553n);
    const missing = episode(CODE_GEASS, 1, 2, 734_003_200n);

    expect(RenamedItemMatcher.match([renamed], [missing])).toEqual(new Map([[renamed, missing]]));
  });

  test('Pairs the single file of a movie with the missing one of the same movie', () => {
    const renamed = movie(ARRIVAL, 4_294_967_296n);
    const missing = movie(ARRIVAL, 2_147_483_648n);

    expect(RenamedItemMatcher.match([renamed], [missing])).toEqual(new Map([[renamed, missing]]));
  });

  test('Pairs a file with a missing one of another media by its exact size', () => {
    const moved = episode(CODE_GEASS_RENAMED, 1, 1, 1_503_238_553n);
    const missing = episode(CODE_GEASS, 1, 1, 1_503_238_553n);

    expect(RenamedItemMatcher.match([moved], [missing])).toEqual(new Map([[moved, missing]]));
  });

  test('Prefers the same episode of the same show over a file of the same size', () => {
    const renamed = episode(CODE_GEASS, 1, 2, 1_503_238_553n);
    const sameEpisode = episode(CODE_GEASS, 1, 2, 734_003_200n);
    const sameSize = episode(CODE_GEASS, 1, 3, 1_503_238_553n);

    expect(RenamedItemMatcher.match([renamed], [sameSize, sameEpisode])).toEqual(new Map([[renamed, sameEpisode]]));
  });

  test('Leaves a file unpaired when two missing files have its size', () => {
    const moved = episode(CODE_GEASS_RENAMED, 1, 1, 1_503_238_553n);

    const matches = RenamedItemMatcher.match([moved], [episode(CODE_GEASS, 1, 1, 1_503_238_553n), episode(CODE_GEASS, 1, 2, 1_503_238_553n)]);

    expect(matches.size).toBe(0);
  });

  test('Leaves two files of the same size unpaired when only one is missing', () => {
    const matches = RenamedItemMatcher.match(
      [episode(CODE_GEASS_RENAMED, 1, 1, 1_503_238_553n), episode(CODE_GEASS_RENAMED, 1, 2, 1_503_238_553n)],
      [episode(CODE_GEASS, 1, 1, 1_503_238_553n)],
    );

    expect(matches.size).toBe(0);
  });

  test('Leaves two releases of the same episode unpaired', () => {
    const matches = RenamedItemMatcher.match(
      [episode(CODE_GEASS, 1, 2, 734_003_200n), episode(CODE_GEASS, 1, 2, 1_503_238_553n)],
      [episode(CODE_GEASS, 1, 2, 524_288_000n)],
    );

    expect(matches.size).toBe(0);
  });

  test('Does not pair by size when a size is unknown', () => {
    const matches = RenamedItemMatcher.match([episode(CODE_GEASS_RENAMED, 1, 1, 1_503_238_553n)], [episode(CODE_GEASS, 1, 1, null)]);

    expect(matches.size).toBe(0);
  });

  test('Pairs each missing item with one file at most', () => {
    const renamed = episode(CODE_GEASS, 1, 2, 734_003_200n);
    const moved = episode(CODE_GEASS_RENAMED, 1, 2, 1_503_238_553n);
    const missing = episode(CODE_GEASS, 1, 2, 1_503_238_553n);

    expect(RenamedItemMatcher.match([renamed, moved], [missing])).toEqual(new Map([[renamed, missing]]));
  });
});
