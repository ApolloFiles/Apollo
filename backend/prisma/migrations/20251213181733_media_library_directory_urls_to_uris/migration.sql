/*
  Warnings:

  - You are about to drop the column `directory_urls` on the `media_libraries` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "media_libraries" DROP COLUMN "directory_urls",
ADD COLUMN     "directory_uris" TEXT[];
