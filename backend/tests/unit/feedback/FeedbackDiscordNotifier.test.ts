import type { HttpResponse } from '@spraxdev/node-commons/http';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { DeepMockProxy } from 'vitest-mock-extended';
import type AppConfiguration from '../../../src/config/AppConfiguration.js';
import FeedbackDiscordNotifier, { type FeedbackNotification } from '../../../src/feedback/FeedbackDiscordNotifier.js';
import type SimpleHttpClient from '../../../src/http/SimpleHttpClient.js';
import { createStrictDeepMock } from '../../test-helpers.js';

const FEEDBACK: FeedbackNotification = {
  id: 'report-id',
  category: 'FEEDBACK',
  message: 'The player keeps buffering',
  userDisplayName: 'SomeUser',
};

function createHttpResponse(statusCode: number): HttpResponse {
  return { statusCode, ok: statusCode >= 200 && statusCode < 300 } as HttpResponse;
}

function createNotifier(discordWebhookUrl: string | null): {
  notifier: FeedbackDiscordNotifier,
  httpClient: DeepMockProxy<SimpleHttpClient>,
} {
  const appConfig = createStrictDeepMock<AppConfiguration>({
    config: {
      baseUrl: 'https://apollo.example.com',
      feedback: { discordWebhookUrl },
    },
  });
  const httpClient = createStrictDeepMock<SimpleHttpClient>();
  httpClient.post.mockResolvedValue(createHttpResponse(204));

  return { notifier: new FeedbackDiscordNotifier(appConfig, httpClient), httpClient };
}

function parseSentEmbed(httpClient: DeepMockProxy<SimpleHttpClient>): any {
  const body = httpClient.post.mock.calls[0][1]?.body;
  return JSON.parse(body as string).embeds[0];
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('FeedbackDiscordNotifier#notify', () => {
  test('Sends nothing when no webhook url is configured', async () => {
    const { notifier, httpClient } = createNotifier(null);

    await notifier.notify(FEEDBACK);

    expect(httpClient.post).not.toHaveBeenCalled();
  });

  test('Posts a preview linking to the admin page of the report', async () => {
    const { notifier, httpClient } = createNotifier('https://discord.com/api/webhooks/1/token');

    await notifier.notify(FEEDBACK);

    expect(httpClient.post.mock.calls[0][0]).toBe('https://discord.com/api/webhooks/1/token');

    const embed = parseSentEmbed(httpClient);
    expect(embed.url).toBe('https://apollo.example.com/admin/feedback/report-id');
    expect(embed.description).toBe('The player keeps buffering');
    expect(embed.author.name).toBe('SomeUser');
  });

  test('Suppresses mentions so submitted text cannot ping the Discord server', async () => {
    const { notifier, httpClient } = createNotifier('https://discord.com/api/webhooks/1/token');

    await notifier.notify({ ...FEEDBACK, message: '@everyone please fix this' });

    const payload = JSON.parse(httpClient.post.mock.calls[0][1]?.body as string);
    expect(payload.allowed_mentions).toEqual({ parse: [] });
  });

  test('Truncates a long message instead of forwarding the whole report', async () => {
    const { notifier, httpClient } = createNotifier('https://discord.com/api/webhooks/1/token');

    await notifier.notify({ ...FEEDBACK, message: 'a'.repeat(4000) });

    const embed = parseSentEmbed(httpClient);
    expect(embed.description).toHaveLength(320);
    expect(embed.description.endsWith('…')).toBe(true);
  });

  test('Collapses whitespace so a multi-line report stays a one-line preview', async () => {
    const { notifier, httpClient } = createNotifier('https://discord.com/api/webhooks/1/token');

    await notifier.notify({ ...FEEDBACK, message: ' first line \n\n second line ' });

    expect(parseSentEmbed(httpClient).description).toBe('first line second line');
  });

  test('Does not propagate a failing webhook request to the caller', async () => {
    const { notifier, httpClient } = createNotifier('https://discord.com/api/webhooks/1/token');
    httpClient.post.mockRejectedValue(new Error('connection refused'));

    await expect(notifier.notify(FEEDBACK)).resolves.toBeUndefined();
  });

  test('Warns when Discord rejects the webhook', async () => {
    const { notifier, httpClient } = createNotifier('https://discord.com/api/webhooks/1/token');
    httpClient.post.mockResolvedValue(createHttpResponse(404));

    await notifier.notify(FEEDBACK);

    expect(console.warn).toHaveBeenCalled();
  });
});
