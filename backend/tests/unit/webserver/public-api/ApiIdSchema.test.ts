import { API_ID_SCHEMA } from '#src/webserver/public-api/ApiIdSchema.js';

describe('API_ID_SCHEMA', () => {
  test.for([
    '7302000000000000003',
    '9223372036854775807',
    '1',
  ])('Accepts the id %s', (id) => {
    expect(API_ID_SCHEMA.safeParse(id).success).toBe(true);
  });

  test.for([
    '9223372036854775808',
    '99999999999999999999',
    '',
    'cowboy-bebop',
    '-1',
    '1e30',
  ])('Rejects \'%s\', which cannot be an id', (id) => {
    expect(API_ID_SCHEMA.safeParse(id).success).toBe(false);
  });
});
