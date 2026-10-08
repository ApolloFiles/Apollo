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
} from '#src/plugins/official/media/library/external_metadata/AniDb/xml/XmlSchemaHelpers.js';

describe('XmlSchemaHelpers', () => {
  describe('xmlInt', () => {
    test.for([
      { input: '42', expected: 42 },
      { input: '-7', expected: -7 },
    ])('Turns the numeric string $input into $expected', ({ input, expected }) => {
      expect(xmlInt.parse(input)).toBe(expected);
    });

    test.for([
      { description: 'a decimal', input: '4.2' },
      { description: 'an empty string', input: '' },
      { description: 'digits followed by letters', input: '12abc' },
      { description: 'a number instead of a string', input: 42 },
    ])('Rejects $description', ({ input }) => {
      expect(xmlInt.safeParse(input).success).toBe(false);
    });
  });

  describe('xmlNumber', () => {
    test.for([
      { input: '42', expected: 42 },
      { input: '-4.25', expected: -4.25 },
    ])('Turns the numeric string $input into $expected', ({ input, expected }) => {
      expect(xmlNumber.parse(input)).toBe(expected);
    });

    test.for([
      { description: 'a decimal without fraction digits', input: '4.' },
      { description: 'a decimal without integer digits', input: '.4' },
      { description: 'scientific notation', input: '1e3' },
      { description: 'a number instead of a string', input: 4.2 },
    ])('Rejects $description', ({ input }) => {
      expect(xmlNumber.safeParse(input).success).toBe(false);
    });
  });

  describe('xmlBool', () => {
    test.for([
      { input: 'true', expected: true },
      { input: '1', expected: true },
      { input: 'false', expected: false },
      { input: '0', expected: false },
    ])('Turns the string $input into $expected', ({ input, expected }) => {
      expect(xmlBool.parse(input)).toBe(expected);
    });

    test.for([
      { description: 'the word yes', input: 'yes' },
      { description: 'an upper-case TRUE', input: 'TRUE' },
      { description: 'a boolean instead of a string', input: true },
    ])('Rejects $description', ({ input }) => {
      expect(xmlBool.safeParse(input).success).toBe(false);
    });
  });

  describe('xmlText', () => {
    test('Unwraps the text node into a plain string', () => {
      expect(xmlText.parse({ '#text': 'some title' })).toBe('some title');
    });

    test('Unwraps an empty text node into an empty string', () => {
      expect(xmlText.parse({ '#text': '' })).toBe('');
    });

    test.for([
      { description: 'a node with an attribute', input: { '#text': 'some title', '@_type': 'main' } },
      { description: 'a node without text', input: {} },
      { description: 'a plain string', input: 'some title' },
    ])('Rejects $description', ({ input }) => {
      expect(xmlText.safeParse(input).success).toBe(false);
    });
  });

  describe(xmlArray, () => {
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

    test.for([
      { description: 'a single invalid element', input: { '#text': 5 } },
      { description: 'an array with an invalid element', input: [{ '#text': 'first' }, 'second'] },
    ])('Rejects $description', ({ input }) => {
      expect(schema.safeParse(input).success).toBe(false);
    });
  });

  describe('simpleDate', () => {
    test('Turns a full date into its parts', () => {
      expect(simpleDate.parse('2023-10-22')).toEqual({ year: 2023, month: 10, day: 22 });
    });

    test('Accepts the 29th of February in a leap year', () => {
      expect(simpleDate.parse('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 });
    });

    test.for([
      { input: '2024-03' },
      { input: '2024-3-01' },
      { input: '24-03-01' },
    ])('Rejects the partial or malformed date $input', ({ input }) => {
      expect(simpleDate.safeParse(input).success).toBe(false);
    });

    test('Rejects an empty string', () => {
      expect(simpleDate.safeParse('').success).toBe(false);
    });

    test.for([
      { input: '2023-02-29' },
      { input: '2024-04-31' },
      { input: '2024-13-01' },
      { input: '2024-00-10' },
    ])('Rejects $input, which does not exist in the calendar', ({ input }) => {
      expect(simpleDate.safeParse(input).success).toBe(false);
    });
  });

  describe('partialSimpleDate', () => {
    test.for([
      { input: '2024', expected: { year: 2024, month: null, day: null } },
      { input: '2024-03', expected: { year: 2024, month: 3, day: null } },
      { input: '2024-03-24', expected: { year: 2024, month: 3, day: 24 } },
    ])('Turns $input into its parts', ({ input, expected }) => {
      expect(partialSimpleDate.parse(input)).toEqual(expected);
    });

    test.for([
      { input: '2024-' },
      { input: '2024-3' },
      { input: 'abc' },
    ])('Rejects the malformed date $input', ({ input }) => {
      expect(partialSimpleDate.safeParse(input).success).toBe(false);
    });

    test.for([
      { input: '2024-13' },
      { input: '2024-02-30' },
    ])('Rejects $input, which does not exist in the calendar', ({ input }) => {
      expect(partialSimpleDate.safeParse(input).success).toBe(false);
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
});
