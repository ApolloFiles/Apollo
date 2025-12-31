-- AlterTable
ALTER TABLE "auth_users_linked_providers" ADD COLUMN     "linked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
