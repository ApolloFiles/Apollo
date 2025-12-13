/*
  Warnings:

  - You are about to drop the column `mediaLibraryMedia_NEWId` on the `media_libraries_media_items` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "media_libraries_media_items" DROP CONSTRAINT "media_libraries_media_items_mediaLibraryMedia_NEWId_fkey";

-- AlterTable
ALTER TABLE "media_libraries_media_items" DROP COLUMN "mediaLibraryMedia_NEWId";
