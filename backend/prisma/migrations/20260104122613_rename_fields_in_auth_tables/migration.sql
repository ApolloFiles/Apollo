-- AlterTable
ALTER TABLE "auth_anonymous_sessions" ALTER COLUMN "expires_at" SET DEFAULT (now() + INTERVAL '10 minutes');

-- AlterTable
ALTER TABLE "auth_users_linked_providers" RENAME COLUMN "provider" TO "provider_id";
ALTER TABLE "auth_users_linked_providers" RENAME COLUMN "provider_profile_picture" TO "provider_user_profile_picture";

-- AlterIndex
ALTER INDEX "auth_users_linked_providers_provider_provider_user_id_key" RENAME TO "auth_users_linked_providers_provider_id_provider_user_id_key";
