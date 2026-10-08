import { classifyId, EPISODE_KINDS } from '#src/plugins/official/media/library/external_metadata/AniDb/parsing/AnimeEnums.js';

describe('classifyId', () => {
  test('Names a known id', () => {
    expect(classifyId(EPISODE_KINDS, 2)).toEqual({ id: 2, name: 'special' });
  });

  test('Keeps an unknown id and leaves its name empty', () => {
    expect(classifyId(EPISODE_KINDS, 99)).toEqual({ id: 99, name: null });
  });
});
