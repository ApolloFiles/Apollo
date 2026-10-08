import type { HttpResponse } from '@spraxdev/node-commons/http';
import type { DeepMockProxy } from 'vitest-mock-extended';
import type AppConfiguration from '#src/config/AppConfiguration.js';
import FeedbackDiscordNotifier, { type FeedbackNotification } from '#src/feedback/FeedbackDiscordNotifier.js';
import type SimpleHttpClient from '#src/http/SimpleHttpClient.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';

const WEBHOOK_URL = 'https://discord.com/api/webhooks/1/token';

const FEEDBACK: FeedbackNotification = {
  id: 'report-id',
  category: 'FEEDBACK',
  message: 'The player keeps buffering',
  userDisplayName: 'SomeUser',
};

function createAppConfig(discordWebhookUrl: string | null): AppConfiguration {
  return createStrictDeepMock<AppConfiguration>({
    config: {
      baseUrl: 'https://apollo.example.com',
      feedback: { discordWebhookUrl },
    },
  });
}

function createHttpResponse(statusCode: number): HttpResponse {
  return { statusCode, ok: statusCode >= 200 && statusCode < 300 } as HttpResponse;
}

function parseSentPayload(httpClient: DeepMockProxy<SimpleHttpClient>): any {
  return JSON.parse(httpClient.post.mock.calls[0][1]?.body as string);
}

describe(FeedbackDiscordNotifier, () => {
  let httpClient: DeepMockProxy<SimpleHttpClient>;
  let notifier: FeedbackDiscordNotifier;

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    httpClient = createStrictDeepMock<SimpleHttpClient>();
    httpClient.post.mockResolvedValue(createHttpResponse(204));
    notifier = new FeedbackDiscordNotifier(createAppConfig(WEBHOOK_URL), httpClient);
  });

  test('Sends nothing when no webhook url is configured', async () => {
    notifier = new FeedbackDiscordNotifier(createAppConfig(null), httpClient);

    await notifier.notify(FEEDBACK);

    expect(httpClient.post).not.toHaveBeenCalled();
  });

  test('Posts the notification as JSON to the configured webhook', async () => {
    await notifier.notify(FEEDBACK);

    expect(httpClient.post).toHaveBeenCalledExactlyOnceWith(WEBHOOK_URL, {
      headers: { 'Content-Type': 'application/json' },
      body: expect.any(String),
    });
  });

  test('Posts a preview linking to the admin page of the report', async () => {
    await notifier.notify(FEEDBACK);

    expect(parseSentPayload(httpClient).embeds[0]).toMatchObject({
      url: 'https://apollo.example.com/admin/feedback/report-id',
      description: 'The player keeps buffering',
      author: { name: 'SomeUser' },
    });
  });

  test('Suppresses mentions so submitted text cannot ping the Discord server', async () => {
    await notifier.notify({ ...FEEDBACK, message: '@everyone please fix this' });

    expect(parseSentPayload(httpClient).allowed_mentions).toEqual({ parse: [] });
  });

  test('Truncates a long message to 320 characters ending in an ellipsis', async () => {
    await notifier.notify({ ...FEEDBACK, message: 'a'.repeat(4000) });

    expect(parseSentPayload(httpClient).embeds[0].description).toBe(`${'a'.repeat(319)}…`);
  });

  test('Collapses whitespace so a multi-line report stays a one-line preview', async () => {
    await notifier.notify({ ...FEEDBACK, message: ' first line \n\n second line ' });

    expect(parseSentPayload(httpClient).embeds[0].description).toBe('first line second line');
  });

  test('Logs a failing webhook request instead of propagating it to the caller', async () => {
    const error = new Error('connection refused');
    httpClient.post.mockRejectedValue(error);

    await expect(notifier.notify(FEEDBACK)).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalledExactlyOnceWith(error);
  });

  test('Warns when Discord rejects the webhook', async () => {
    httpClient.post.mockResolvedValue(createHttpResponse(404));

    await notifier.notify(FEEDBACK);

    expect(console.warn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Discord rejected'));
  });
});
