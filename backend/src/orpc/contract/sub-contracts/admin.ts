import { z } from 'zod';
import { baseOc } from '../SubContractHelpers.js';
import { FEEDBACK_REPORT_CATEGORY_SCHEMA, FEEDBACK_REPORT_STATUS_SCHEMA } from './feedback.js';
import { ORPC_LOGGED_IN_USER_SCHEMA } from './user.js';

const getUserList = baseOc
  .input(z.undefined())
  .output(z.strictObject({
    loggedInUser: ORPC_LOGGED_IN_USER_SCHEMA,
    users: z.array(z.strictObject({
      id: z.string(),
      displayName: z.string(),
      blocked: z.boolean(),
      isSuperUser: z.boolean(),
    })),
  }));
const getUserDetails = baseOc
  .input(z.object({ id: z.string() }))
  .output(z.strictObject({
    loggedInUser: ORPC_LOGGED_IN_USER_SCHEMA,
    user: z.strictObject({
      id: z.string(),
      displayName: z.string(),
      blocked: z.boolean(),
      isSuperUser: z.boolean(),
      createdAt: z.date(),
      lastLoginDate: z.date().nullable(),
      lastActivityDate: z.date().nullable(),
    }),
    linkedAuthProviders: z.array(z.strictObject({
      identifier: z.string(),
      displayName: z.string(),
      providerUserId: z.string(),
      providerUserDisplayName: z.string().nullable(),
      linkedAt: z.date(),
    })),
  }));
const updateUserBlockStatus = baseOc
  .input(z.object({ id: z.string(), block: z.boolean() }))
  .output(z.undefined());
const unlinkAUsersAuthProvider = baseOc
  .input(z.object({ id: z.string(), providerId: z.string() }))
  .output(z.undefined());

const createAccountCreationInvitation = baseOc
  .input(z.undefined())
  .output(z.strictObject({
    inviteToken: z.string(),
  }));

const FEEDBACK_REPORT_USER_SCHEMA = z.strictObject({
  id: z.string(),
  displayName: z.string(),
});

const getFeedbackReportList = baseOc
  .input(z.undefined())
  .output(z.strictObject({
    loggedInUser: ORPC_LOGGED_IN_USER_SCHEMA,
    reports: z.array(z.strictObject({
      id: z.string(),
      category: FEEDBACK_REPORT_CATEGORY_SCHEMA,
      status: FEEDBACK_REPORT_STATUS_SCHEMA,
      message: z.string(),
      appVersion: z.string(),
      createdAt: z.date(),
      user: FEEDBACK_REPORT_USER_SCHEMA,
    })),
  }));
const getFeedbackReportDetails = baseOc
  .input(z.object({ id: z.string() }))
  .output(z.strictObject({
    loggedInUser: ORPC_LOGGED_IN_USER_SCHEMA,
    report: z.strictObject({
      id: z.string(),
      category: FEEDBACK_REPORT_CATEGORY_SCHEMA,
      status: FEEDBACK_REPORT_STATUS_SCHEMA,
      message: z.string(),
      context: z.unknown(),
      adminNote: z.string().nullable(),
      appVersion: z.string(),
      createdAt: z.date(),
      updatedAt: z.date(),
      user: FEEDBACK_REPORT_USER_SCHEMA,
    }),
  }));
const updateFeedbackReport = baseOc
  .input(z.object({
    id: z.string(),
    status: FEEDBACK_REPORT_STATUS_SCHEMA,
    adminNote: z.string().trim().max(4000).nullable(),
  }))
  .output(z.undefined());
const deleteFeedbackReport = baseOc
  .input(z.object({ id: z.string() }))
  .output(z.undefined());

export const adminContract = {
  users: {
    list: getUserList,
    get: getUserDetails,
    updateBlock: updateUserBlockStatus,
    unlinkAuthProvider: unlinkAUsersAuthProvider,
  },

  accountCreationInvitation: {
    create: createAccountCreationInvitation,
  },

  feedback: {
    list: getFeedbackReportList,
    get: getFeedbackReportDetails,
    update: updateFeedbackReport,
    delete: deleteFeedbackReport,
  },
};
