import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import {
  multilineText,
  partialSimpleDate,
  simpleDate,
  xmlArray,
  xmlBool,
  xmlInt,
  xmlNumber,
  xmlText,
} from '../../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/xml/XmlSchemaHelpers.js';

describe('xmlInt', () => {
  test('Turns a numeric string into a number', () => {
    expect(xmlInt.parse('42')).toBe(42);
    expect(xmlInt.parse('-7')).toBe(-7);
  });

  test('Rejects anything that is not an integer string', () => {
    expect(xmlInt.safeParse('4.2').success).toBe(false);
    expect(xmlInt.safeParse('').success).toBe(false);
    expect(xmlInt.safeParse('12abc').success).toBe(false);
    expect(xmlInt.safeParse(42).success).toBe(false);
  });
});

describe('xmlNumber', () => {
  test('Accepts integers and decimals', () => {
    expect(xmlNumber.parse('42')).toBe(42);
    expect(xmlNumber.parse('-4.25')).toBe(-4.25);
  });

  test('Rejects malformed decimals and non-strings', () => {
    expect(xmlNumber.safeParse('4.').success).toBe(false);
    expect(xmlNumber.safeParse('.4').success).toBe(false);
    expect(xmlNumber.safeParse('1e3').success).toBe(false);
    expect(xmlNumber.safeParse(4.2).success).toBe(false);
  });
});

describe('xmlBool', () => {
  test('Accepts both the word and the digit spelling', () => {
    expect(xmlBool.parse('true')).toBe(true);
    expect(xmlBool.parse('1')).toBe(true);
    expect(xmlBool.parse('false')).toBe(false);
    expect(xmlBool.parse('0')).toBe(false);
  });

  test('Rejects any other spelling', () => {
    expect(xmlBool.safeParse('yes').success).toBe(false);
    expect(xmlBool.safeParse('TRUE').success).toBe(false);
    expect(xmlBool.safeParse(true).success).toBe(false);
  });
});

describe('xmlText', () => {
  test('Unwraps the text node into a plain string', () => {
    expect(xmlText.parse({ '#text': 'some title' })).toBe('some title');
    expect(xmlText.parse({ '#text': '' })).toBe('');
  });

  test('Rejects a node carrying anything besides its text', () => {
    expect(xmlText.safeParse({ '#text': 'some title', '@_type': 'main' }).success).toBe(false);
    expect(xmlText.safeParse({}).success).toBe(false);
    expect(xmlText.safeParse('some title').success).toBe(false);
  });
});

describe('xmlArray', () => {
  const schema = xmlArray(z.strictObject({ '#text': z.string() }));

  test('Wraps a single element into a one-element array', () => {
    expect(schema.parse({ '#text': 'only one' })).toEqual([{ '#text': 'only one' }]);
  });

  test('Keeps an existing array as-is', () => {
    expect(schema.parse([{ '#text': 'first' }, { '#text': 'second' }])).toEqual([{ '#text': 'first' }, { '#text': 'second' }]);
  });

  test('Turns a missing element into an empty array', () => {
    expect(schema.parse(undefined)).toEqual([]);
  });

  test('Still validates the wrapped elements', () => {
    expect(schema.safeParse({ '#text': 5 }).success).toBe(false);
    expect(schema.safeParse([{ '#text': 'first' }, 'second']).success).toBe(false);
  });
});

describe('simpleDate', () => {
  test('Turns a full date into its parts', () => {
    expect(simpleDate.parse('2023-10-22')).toEqual({ year: 2023, month: 10, day: 22 });
  });

  test('Accepts the 29th of February in a leap year', () => {
    expect(simpleDate.parse('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 });
  });

  test('Rejects partial or malformed dates', () => {
    expect(simpleDate.safeParse('2024-03').success).toBe(false);
    expect(simpleDate.safeParse('2024-3-01').success).toBe(false);
    expect(simpleDate.safeParse('24-03-01').success).toBe(false);
    expect(simpleDate.safeParse('').success).toBe(false);
  });

  test('Rejects dates that do not exist in the calendar', () => {
    expect(simpleDate.safeParse('2023-02-29').success).toBe(false);
    expect(simpleDate.safeParse('2024-04-31').success).toBe(false);
    expect(simpleDate.safeParse('2024-13-01').success).toBe(false);
    expect(simpleDate.safeParse('2024-00-10').success).toBe(false);
  });
});

describe('partialSimpleDate', () => {
  test('Accepts a year, a year and month, or a full date', () => {
    expect(partialSimpleDate.parse('2024')).toEqual({ year: 2024, month: null, day: null });
    expect(partialSimpleDate.parse('2024-03')).toEqual({ year: 2024, month: 3, day: null });
    expect(partialSimpleDate.parse('2024-03-24')).toEqual({ year: 2024, month: 3, day: 24 });
  });

  test('Rejects malformed dates', () => {
    expect(partialSimpleDate.safeParse('2024-').success).toBe(false);
    expect(partialSimpleDate.safeParse('2024-3').success).toBe(false);
    expect(partialSimpleDate.safeParse('abc').success).toBe(false);
  });

  test('Rejects months and days that do not exist in the calendar', () => {
    expect(partialSimpleDate.safeParse('2024-13').success).toBe(false);
    expect(partialSimpleDate.safeParse('2024-02-30').success).toBe(false);
  });
});

describe('multilineText', () => {
  test('Turns Windows and old Mac line breaks into plain line feeds', () => {
    expect(multilineText.parse('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
  });

  test('Leaves text without line breaks unchanged', () => {
    expect(multilineText.parse('no line breaks')).toBe('no line breaks');
  });
});
