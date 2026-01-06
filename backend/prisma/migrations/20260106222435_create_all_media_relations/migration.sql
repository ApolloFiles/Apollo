-- CreateEnum
CREATE TYPE "media_library_media_external_id_source" AS ENUM ('THE_MOVIE_DB', 'IMDB', 'THE_TV_DB');

-- CreateEnum
CREATE TYPE "media_library_media_fallback_image_type" AS ENUM ('POSTER', 'BACKDROP', 'LOGO');

-- CreateTable
CREATE TABLE "media_libraries" (
    "id" BIGINT NOT NULL DEFAULT generate_snowflake('media_libraries_id_seq'::text),
    "owner_id" TEXT NOT NULL,
    "name" VARCHAR(256) NOT NULL,
    "directory_uris" TEXT[],

    CONSTRAINT "media_libraries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_libraries_shared_with" (
    "library_id" BIGINT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "media_libraries_shared_with_pkey" PRIMARY KEY ("library_id","user_id")
);

-- CreateTable
CREATE TABLE "media_libraries_media" (
    "id" BIGINT NOT NULL DEFAULT generate_snowflake('media_libraries_media_id_seq'::text),
    "library_id" BIGINT NOT NULL,
    "title" TEXT NOT NULL,
    "synopsis" TEXT,
    "directory_uri" TEXT NOT NULL,
    "added_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "external_api_fetched_at" TIMESTAMPTZ,

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
    "external_api_fetched_at" TIMESTAMPTZ,

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

-- CreateTable
CREATE TABLE "media_libraries_media_external_ids" (
    "media_id" BIGINT NOT NULL,
    "source" "media_library_media_external_id_source" NOT NULL,
    "external_id" TEXT NOT NULL,

    CONSTRAINT "media_libraries_media_external_ids_pkey" PRIMARY KEY ("media_id","source")
);

-- CreateTable
CREATE TABLE "media_libraries_media_fallback_images" (
    "media_id" BIGINT NOT NULL,
    "type" "media_library_media_fallback_image_type" NOT NULL,
    "image" BYTEA NOT NULL,

    CONSTRAINT "media_libraries_media_fallback_images_pkey" PRIMARY KEY ("media_id","type")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_libraries_media_library_id_directory_uri_key" ON "media_libraries_media"("library_id", "directory_uri");

-- CreateIndex
CREATE UNIQUE INDEX "media_libraries_media_items_media_id_relative_file_path_key" ON "media_libraries_media_items"("media_id", "relative_file_path");

-- AddForeignKey
ALTER TABLE "media_libraries" ADD CONSTRAINT "media_libraries_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_libraries_shared_with" ADD CONSTRAINT "media_libraries_shared_with_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "media_libraries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_libraries_shared_with" ADD CONSTRAINT "media_libraries_shared_with_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_libraries_media" ADD CONSTRAINT "media_libraries_media_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "media_libraries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_libraries_media_items" ADD CONSTRAINT "media_libraries_media_items_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_libraries_media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_libraries_user_watch_progress" ADD CONSTRAINT "media_libraries_user_watch_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_libraries_user_watch_progress" ADD CONSTRAINT "media_libraries_user_watch_progress_media_item_id_fkey" FOREIGN KEY ("media_item_id") REFERENCES "media_libraries_media_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_libraries_media_external_ids" ADD CONSTRAINT "media_libraries_media_external_ids_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_libraries_media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_libraries_media_fallback_images" ADD CONSTRAINT "media_libraries_media_fallback_images_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_libraries_media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateSequence
CREATE SEQUENCE "media_libraries_id_seq";
ALTER SEQUENCE "media_libraries_id_seq" OWNED BY "media_libraries"."id";

-- CreateSequence
CREATE SEQUENCE "media_libraries_media_id_seq";
ALTER SEQUENCE "media_libraries_media_id_seq" OWNED BY "media_libraries_media"."id";

-- CreateSequence
CREATE SEQUENCE "media_libraries_media_items_id_seq";
ALTER SEQUENCE "media_libraries_media_items_id_seq" OWNED BY "media_libraries_media_items"."id";
