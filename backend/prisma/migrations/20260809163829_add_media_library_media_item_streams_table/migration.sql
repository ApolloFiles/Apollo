-- CreateEnum
CREATE TYPE "media_library_media_stream_type" AS ENUM ('VIDEO', 'AUDIO', 'SUBTITLE');

-- CreateTable
CREATE TABLE "media_library_media_item_streams" (
    "media_item_id" BIGINT NOT NULL,
    "index" INTEGER NOT NULL,
    "type" "media_library_media_stream_type" NOT NULL,
    "language" VARCHAR(35) NOT NULL DEFAULT 'und',
    "flag_default" BOOLEAN NOT NULL,
    "flag_commentary" BOOLEAN NOT NULL,
    "for_hearing_impaired" BOOLEAN NOT NULL DEFAULT false,
    "treat_as_forced" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "media_library_media_item_streams_pkey" PRIMARY KEY ("media_item_id","index")
);

-- AddForeignKey
ALTER TABLE "media_library_media_item_streams" ADD CONSTRAINT "media_library_media_item_streams_media_item_id_fkey" FOREIGN KEY ("media_item_id") REFERENCES "media_libraries_media_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
