/*
  Warnings:

  - The values [ANILIST,MY_ANIME_LIST,ANIDB] on the enum `media_library_media_external_id_source` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "media_library_media_external_id_source_new" AS ENUM ('THE_MOVIE_DB', 'IMDB', 'THE_TV_DB');
ALTER TABLE "media_libraries_media_external_ids" ALTER COLUMN "source" TYPE "media_library_media_external_id_source_new" USING ("source"::text::"media_library_media_external_id_source_new");
ALTER TYPE "media_library_media_external_id_source" RENAME TO "media_library_media_external_id_source_old";
ALTER TYPE "media_library_media_external_id_source_new" RENAME TO "media_library_media_external_id_source";
DROP TYPE "public"."media_library_media_external_id_source_old";
COMMIT;
