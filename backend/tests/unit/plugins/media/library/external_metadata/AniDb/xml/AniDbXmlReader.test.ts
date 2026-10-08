import { AniDbXmlReader } from '../../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/xml/AniDbXmlReader.js';

describe('AniDbXmlReader#read', () => {
  test('Exposes the xml declaration as its own key', () => {
    const reader = new AniDbXmlReader();

    expect(reader.read('<?xml version="1.0" encoding="UTF-8"?><error code="500">banned</error>')).toEqual({
      '?xml': { '#text': '', '@_version': '1.0', '@_encoding': 'UTF-8' },
      error: { '#text': 'banned', '@_code': '500' },
    });
  });

  test('Prefixes attributes and keeps their values as strings', () => {
    const reader = new AniDbXmlReader();

    expect(reader.read('<anime id="1" restricted="false"><episodes>26</episodes></anime>')).toEqual({
      anime: {
        '@_id': '1',
        '@_restricted': 'false',
        episodes: { '#text': '26' },
      },
    });
  });

  test('Always creates a text node, even for an empty element', () => {
    const reader = new AniDbXmlReader();

    expect(reader.read('<error></error>')).toEqual({ error: { '#text': '' } });
    expect(reader.read('<error/>')).toEqual({ error: { '#text': '' } });
  });

  test('Decodes entities and trims surrounding whitespace', () => {
    const reader = new AniDbXmlReader();

    expect(reader.read('<title>  Tom &amp; Jerry  </title>')).toEqual({ title: { '#text': 'Tom & Jerry' } });
  });

  test('Decodes numeric character references in text and attributes', () => {
    const reader = new AniDbXmlReader();

    expect(reader.read('<description note="it&#039;s">line1&#13;\nline2 &#x2019;</description>')).toEqual({
      description: { '#text': 'line1\r\nline2 ’', '@_note': 'it\'s' },
    });
  });

  test('Collapses repeated sibling elements into an array', () => {
    const reader = new AniDbXmlReader();

    expect(reader.read('<titles><title>First</title><title>Second</title></titles>')).toEqual({
      titles: { title: [{ '#text': 'First' }, { '#text': 'Second' }] },
    });
  });

  test('Returns a partial result instead of throwing on malformed xml', () => {
    const reader = new AniDbXmlReader();

    expect(reader.read('<error>oops')).toEqual({ error: { '#text': '' } });
  });
});
