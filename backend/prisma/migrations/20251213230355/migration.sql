/*
  Warnings:

  - You are about to drop the column `directory_paths` on the `media_libraries` table. All the data in the column will be lost.
  - You are about to drop the `media_libraries_media` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `media_libraries_media_items` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `media_libraries_media_items_new` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `media_libraries_media_new` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `media_libraries_user_watch_progress` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "media_libraries_media" DROP CONSTRAINT "media_libraries_media_library_id_fkey";

-- DropForeignKey
ALTER TABLE "media_libraries_media_items" DROP CONSTRAINT "media_libraries_media_items_media_id_fkey";

-- DropForeignKey
ALTER TABLE "media_libraries_media_items_new" DROP CONSTRAINT "media_libraries_media_items_new_media_id_fkey";

-- DropForeignKey
ALTER TABLE "media_libraries_media_new" DROP CONSTRAINT "media_libraries_media_new_library_id_fkey";

-- DropForeignKey
ALTER TABLE "media_libraries_user_watch_progress" DROP CONSTRAINT "media_libraries_user_watch_progress_media_item_id_fkey";

-- AlterTable
ALTER TABLE "media_libraries" DROP COLUMN "directory_paths";

-- DropTable
DROP TABLE "media_libraries_media";

-- DropTable
DROP TABLE "media_libraries_media_items";

-- DropTable
DROP TABLE "media_libraries_media_items_new";

-- DropTable
DROP TABLE "media_libraries_media_new";

-- DropTable
DROP TABLE "media_libraries_user_watch_progress";
