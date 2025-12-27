-- CreateEnum
CREATE TYPE "media_library_media_external_id_source" AS ENUM ('THE_MOVIE_DB', 'IMDB', 'ANILIST', 'MY_ANIME_LIST', 'ANIDB');

-- CreateTable
CREATE TABLE "media_libraries_media_external_ids" (
    "media_id" BIGINT NOT NULL,
    "source" "media_library_media_external_id_source" NOT NULL,
    "external_id" TEXT NOT NULL,

    CONSTRAINT "media_libraries_media_external_ids_pkey" PRIMARY KEY ("media_id","source")
);

-- AddForeignKey
ALTER TABLE "media_libraries_media_external_ids" ADD CONSTRAINT "media_libraries_media_external_ids_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_libraries_media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
