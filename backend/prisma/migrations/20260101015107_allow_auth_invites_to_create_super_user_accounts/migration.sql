-- AlterTable
ALTER TABLE "auth_account_creation_invite_tokens" ADD COLUMN     "createSuperUserAccount" BOOLEAN NOT NULL DEFAULT false;
