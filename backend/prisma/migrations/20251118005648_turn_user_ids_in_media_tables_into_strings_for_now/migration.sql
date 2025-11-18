/*
  Warnings:

  - The primary key for the `media_libraries_shared_with` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `media_libraries_user_watch_progress` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "public"."media_libraries" ALTER COLUMN "owner_id" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "public"."media_libraries_shared_with" DROP CONSTRAINT "media_libraries_shared_with_pkey",
ALTER COLUMN "user_id" SET DATA TYPE TEXT,
ADD CONSTRAINT "media_libraries_shared_with_pkey" PRIMARY KEY ("library_id", "user_id");

-- AlterTable
ALTER TABLE "public"."media_libraries_user_watch_progress" DROP CONSTRAINT "media_libraries_user_watch_progress_pkey",
ALTER COLUMN "user_id" SET DATA TYPE TEXT,
ADD CONSTRAINT "media_libraries_user_watch_progress_pkey" PRIMARY KEY ("user_id", "media_item_id");
