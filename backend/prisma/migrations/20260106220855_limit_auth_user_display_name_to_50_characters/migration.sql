/*
  Warnings:

  - You are about to alter the column `display_name` on the `auth_users` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.

*/
-- AlterTable
ALTER TABLE "auth_users" ALTER COLUMN "display_name" SET DATA TYPE VARCHAR(50);
