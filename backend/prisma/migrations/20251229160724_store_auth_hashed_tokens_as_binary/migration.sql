/*
  Warnings:

  - The primary key for the `auth_account_creation_invite_tokens` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `auth_anonymous_sessions` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Changed the type of `hashed_token` on the `auth_account_creation_invite_tokens` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `hashed_token` on the `auth_anonymous_sessions` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `hashed_token` on the `auth_sessions` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "auth_account_creation_invite_tokens" DROP CONSTRAINT "auth_account_creation_invite_tokens_pkey",
DROP COLUMN "hashed_token",
ADD COLUMN     "hashed_token" BYTEA NOT NULL,
ADD CONSTRAINT "auth_account_creation_invite_tokens_pkey" PRIMARY KEY ("hashed_token");

-- AlterTable
ALTER TABLE "auth_anonymous_sessions" DROP CONSTRAINT "auth_anonymous_sessions_pkey",
DROP COLUMN "hashed_token",
ADD COLUMN     "hashed_token" BYTEA NOT NULL,
ADD CONSTRAINT "auth_anonymous_sessions_pkey" PRIMARY KEY ("hashed_token");

-- AlterTable
ALTER TABLE "auth_sessions" DROP COLUMN "hashed_token",
ADD COLUMN     "hashed_token" BYTEA NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_hashed_token_key" ON "auth_sessions"("hashed_token");
