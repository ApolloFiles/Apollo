-- AlterTable
ALTER TABLE "media_libraries_media_items" ADD COLUMN     "mediaLibraryMedia_NEWId" BIGINT;

-- CreateTable
CREATE TABLE "media_libraries_media_new" (
    "id" BIGINT NOT NULL DEFAULT generate_snowflake('media_libraries_media_id_seq'::text),
    "library_id" BIGINT NOT NULL,
    "title" TEXT NOT NULL,
    "directory_uri" TEXT NOT NULL,
    "added_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "synopsis" TEXT,

    CONSTRAINT "media_libraries_media_new_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_libraries_media_new_library_id_directory_uri_key" ON "media_libraries_media_new"("library_id", "directory_uri");

-- AddForeignKey
ALTER TABLE "media_libraries_media_new" ADD CONSTRAINT "media_libraries_media_new_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "media_libraries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_libraries_media_items" ADD CONSTRAINT "media_libraries_media_items_mediaLibraryMedia_NEWId_fkey" FOREIGN KEY ("mediaLibraryMedia_NEWId") REFERENCES "media_libraries_media_new"("id") ON DELETE SET NULL ON UPDATE CASCADE;
