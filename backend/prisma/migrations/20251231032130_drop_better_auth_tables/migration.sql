/*
  Warnings:

  - You are about to drop the `accounts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `sessions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `users` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `verifications` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "better_auth"."accounts" DROP CONSTRAINT "accounts_userId_fkey";

-- DropForeignKey
ALTER TABLE "better_auth"."sessions" DROP CONSTRAINT "sessions_userId_fkey";

-- DropTable
DROP TABLE "better_auth"."accounts";

-- DropTable
DROP TABLE "better_auth"."sessions";

-- DropTable
DROP TABLE "better_auth"."users";

-- DropTable
DROP TABLE "better_auth"."verifications";

-- DropSchema
DROP SCHEMA "better_auth";
