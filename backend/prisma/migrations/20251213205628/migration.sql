-- CreateTable
CREATE TABLE "media_libraries_media_items_new" (
    "id" BIGINT NOT NULL DEFAULT generate_snowflake('media_libraries_media_items_id_seq'::text),
    "media_id" BIGINT NOT NULL,
    "relative_file_path" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "last_scanned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "added_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration_in_sec" INTEGER NOT NULL,
    "synopsis" TEXT,
    "season_number" INTEGER,
    "episode_number" INTEGER,

    CONSTRAINT "media_libraries_media_items_new_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_libraries_media_items_new_media_id_relative_file_path_key" ON "media_libraries_media_items_new"("media_id", "relative_file_path");

-- AddForeignKey
ALTER TABLE "media_libraries_media_items_new" ADD CONSTRAINT "media_libraries_media_items_new_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_libraries_media_new"("id") ON DELETE CASCADE ON UPDATE CASCADE;
