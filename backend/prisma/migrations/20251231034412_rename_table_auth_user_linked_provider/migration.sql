/*
  Warnings:

  - You are about to drop the `auth_linked_auth_providers` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "auth_linked_auth_providers" DROP CONSTRAINT "auth_linked_auth_providers_user_id_fkey";

-- DropTable
DROP TABLE "auth_linked_auth_providers";

-- CreateTable
CREATE TABLE "auth_users_linked_providers" (
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "provider_user_display_name" TEXT,
    "provider_profile_picture" BYTEA,

    CONSTRAINT "auth_users_linked_providers_pkey" PRIMARY KEY ("user_id","provider")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_users_linked_providers_provider_provider_user_id_key" ON "auth_users_linked_providers"("provider", "provider_user_id");

-- AddForeignKey
ALTER TABLE "auth_users_linked_providers" ADD CONSTRAINT "auth_users_linked_providers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
