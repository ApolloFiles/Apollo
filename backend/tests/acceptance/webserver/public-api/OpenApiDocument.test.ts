import { container } from 'tsyringe';
import ApolloWebServer from '#src/webserver/server/ApolloWebServer.js';

describe('OpenApiDocument', () => {
  test('Renders the document for every router the server loads', async () => {
    const server = container.resolve(ApolloWebServer);

    const response = await server.inject('/api/openapi.json');
    await server.shutdown();

    expect(response.statusCode).toBe(200);
    expect(Object.keys(response.json().paths)).toContain('/api/media/v1/media');
  });
});
