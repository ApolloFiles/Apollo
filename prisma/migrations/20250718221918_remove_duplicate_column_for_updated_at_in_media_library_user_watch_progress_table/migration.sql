/*
  Warnings:

  - You are about to drop the column `last_watched` on the `media_libraries_user_watch_progress` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "media_libraries_user_watch_progress" DROP COLUMN "last_watched";
