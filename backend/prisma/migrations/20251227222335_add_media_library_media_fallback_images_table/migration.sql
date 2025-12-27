-- CreateEnum
CREATE TYPE "media_library_media_fallback_image_type" AS ENUM ('POSTER', 'BACKDROP');

-- CreateTable
CREATE TABLE "media_libraries_media_fallback_images" (
    "media_id" BIGINT NOT NULL,
    "type" "media_library_media_fallback_image_type" NOT NULL,
    "image" BYTEA NOT NULL,

    CONSTRAINT "media_libraries_media_fallback_images_pkey" PRIMARY KEY ("media_id","type")
);

-- AddForeignKey
ALTER TABLE "media_libraries_media_fallback_images" ADD CONSTRAINT "media_libraries_media_fallback_images_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_libraries_media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
