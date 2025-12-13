-- CreateTable
CREATE TABLE "media_libraries_media" (
    "id" BIGINT NOT NULL DEFAULT generate_snowflake('media_libraries_media_id_seq'::text),
    "library_id" BIGINT NOT NULL,
    "title" TEXT NOT NULL,
    "synopsis" TEXT,
    "directory_uri" TEXT NOT NULL,
    "added_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_libraries_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_libraries_media_items" (
    "id" BIGINT NOT NULL DEFAULT generate_snowflake('media_libraries_media_items_id_seq'::text),
    "media_id" BIGINT NOT NULL,
    "relative_file_path" TEXT NOT NULL,
    "duration_in_sec" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "synopsis" TEXT,
    "season_number" INTEGER,
    "episode_number" INTEGER,
    "last_scanned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "added_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_libraries_media_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_libraries_user_watch_progress" (
    "user_id" TEXT NOT NULL,
    "media_item_id" BIGINT NOT NULL,
    "duration_in_sec" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "media_libraries_user_watch_progress_pkey" PRIMARY KEY ("user_id","media_item_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_libraries_media_library_id_directory_uri_key" ON "media_libraries_media"("library_id", "directory_uri");

-- CreateIndex
CREATE UNIQUE INDEX "media_libraries_media_items_media_id_relative_file_path_key" ON "media_libraries_media_items"("media_id", "relative_file_path");

-- AddForeignKey
ALTER TABLE "media_libraries_media" ADD CONSTRAINT "media_libraries_media_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "media_libraries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_libraries_media_items" ADD CONSTRAINT "media_libraries_media_items_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_libraries_media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_libraries_user_watch_progress" ADD CONSTRAINT "media_libraries_user_watch_progress_media_item_id_fkey" FOREIGN KEY ("media_item_id") REFERENCES "media_libraries_media_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
