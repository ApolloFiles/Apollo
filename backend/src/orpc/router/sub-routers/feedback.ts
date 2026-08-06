import { injectable } from 'tsyringe';
import AppConfiguration from '../../../config/AppConfiguration.js';
import { getAppInfo } from '../../../constants.js';
import DatabaseClient from '../../../database/DatabaseClient.js';
import type { Prisma } from '../../../database/prisma-client/client.js';
import type { ORpcImplementer, SubRouter } from '../ORpcRouter.js';

@injectable()
export default class FeedbackORpcRouterFactory {
  private static readonly MAX_CONTEXT_JSON_LENGTH = 64_000;

  constructor(
    private readonly appConfig: AppConfiguration,
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  create(os: ORpcImplementer['feedback']): SubRouter<'feedback'> {
    return {
      submit: os.submit.handler(async ({ input, context, errors }) => {
        if (!this.appConfig.config.feedback.enabled) {
          throw errors.FEATURE_DISABLED();
        }

        if (input.context != null && JSON.stringify(input.context).length > FeedbackORpcRouterFactory.MAX_CONTEXT_JSON_LENGTH) {
          throw errors.INVALID_INPUT({ message: 'The collected context data is too large' });
        }

        const report = await this.databaseClient.feedbackReport.create({
          data: {
            userId: context.authSession.user.id,
            category: input.category,
            message: input.message,
            context: input.context != null ? (input.context as Prisma.InputJsonValue) : undefined,
            appVersion: getAppInfo().version,
          },
          select: { id: true },
        });

        return { id: report.id };
      }),
    };
  }
}
