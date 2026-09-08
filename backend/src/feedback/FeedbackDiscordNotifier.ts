import { singleton } from 'tsyringe';
import AppConfiguration from '../config/AppConfiguration.js';
import SimpleHttpClient from '../http/SimpleHttpClient.js';
import SentrySdk from '../utils/SentrySdk.js';

export type FeedbackNotification = {
  id: string,
  category: 'BUG' | 'FEEDBACK',
  message: string,
  userDisplayName: string,
};

@singleton()
export default class FeedbackDiscordNotifier {
  private static readonly MESSAGE_PREVIEW_LENGTH = 320;
  private static readonly COLORS: Record<FeedbackNotification['category'], number> = {
    BUG: 0xE5534B,
    FEEDBACK: 0x4C8EDA,
  };
  private static readonly TITLES: Record<FeedbackNotification['category'], string> = {
    BUG: 'New bug report',
    FEEDBACK: 'New feedback',
  };

  constructor(
    private readonly appConfig: AppConfiguration,
    private readonly httpClient: SimpleHttpClient,
  ) {
  }

  async notify(feedback: FeedbackNotification): Promise<void> {
    const webhookUrl = this.appConfig.config.feedback.discordWebhookUrl;
    if (webhookUrl == null) {
      return;
    }

    try {
      const response = await this.httpClient.post(webhookUrl, {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.createPayload(feedback)),
      });

      if (!response.ok) {
        SentrySdk.logAndCaptureWarning('Discord rejected the feedback webhook', {
          statusCode: response.statusCode,
          feedbackReportId: feedback.id,
        });
      }
    } catch (error: unknown) {
      SentrySdk.logAndCaptureError(error);
    }
  }

  private createPayload(feedback: FeedbackNotification): unknown {
    return {
      allowed_mentions: { parse: [] },
      embeds: [{
        title: FeedbackDiscordNotifier.TITLES[feedback.category],
        url: `${this.appConfig.config.baseUrl}/admin/feedback/${feedback.id}`,
        description: this.createMessagePreview(feedback.message),
        color: FeedbackDiscordNotifier.COLORS[feedback.category],
        author: { name: feedback.userDisplayName },
        timestamp: new Date().toISOString(),
      }],
    };
  }

  private createMessagePreview(message: string): string {
    const singleLine = message.replaceAll(/\s+/g, ' ').trim();
    if (singleLine.length <= FeedbackDiscordNotifier.MESSAGE_PREVIEW_LENGTH) {
      return singleLine;
    }
    return `${singleLine.slice(0, FeedbackDiscordNotifier.MESSAGE_PREVIEW_LENGTH - 1).trimEnd()}…`;
  }
}
