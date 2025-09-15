-- CreateFunction
CREATE OR REPLACE FUNCTION generate_snowflake(seq text, shard_id integer DEFAULT 1, OUT snowflake bigint) RETURNS bigint
    LANGUAGE plpgsql
AS
$$
DECLARE
    our_epoch  bigint := 1708214400000; -- 2024-02-18 00:00:00 UTC
    seq_id     bigint;
    now_millis bigint;
    -- the id of this DB shard, must be set for each
    -- schema shard you have - you could pass this as a parameter too
    -- shard_id   int    := 1;
BEGIN
    SELECT nextval(seq) % 1024 INTO seq_id;

    SELECT floor(extract(EPOCH FROM clock_timestamp()) * 1000) INTO now_millis;
    snowflake := (now_millis - our_epoch) << 23;
    snowflake := snowflake | (shard_id << 10);
    snowflake := snowflake | (seq_id);
END;
$$;

-- CreateTable
CREATE TABLE "media_libraries" (
    "id" BIGINT NOT NULL DEFAULT generate_snowflake('media_libraries_id_seq'::text),
    "owner_id" BIGINT NOT NULL,
    "name" VARCHAR(256) NOT NULL,
    "directory_paths" TEXT[],

    CONSTRAINT "media_libraries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_libraries_media" (
    "id" BIGINT NOT NULL DEFAULT generate_snowflake('media_libraries_media_id_seq'::text),
    "library_id" BIGINT NOT NULL,
    "title" TEXT NOT NULL,
    "directory_path" TEXT NOT NULL,
    "added_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "synopsis" TEXT,

    CONSTRAINT "media_libraries_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_libraries_media_items" (
    "id" BIGINT NOT NULL DEFAULT generate_snowflake('media_libraries_media_items_id_seq'::text),
    "media_id" BIGINT NOT NULL,
    "file_path" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "last_scanned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "added_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration_in_sec" INTEGER NOT NULL,
    "episode_number" INTEGER,
    "season_number" INTEGER,
    "synopsis" TEXT,

    CONSTRAINT "media_libraries_media_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_libraries_user_watch_progress" (
    "user_id" BIGINT NOT NULL,
    "media_item_id" BIGINT NOT NULL,
    "last_watched" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration_in_sec" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "media_libraries_user_watch_progress_pkey" PRIMARY KEY ("user_id","media_item_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_libraries_media_library_id_directory_path_key" ON "media_libraries_media"("library_id", "directory_path");

-- CreateIndex
CREATE UNIQUE INDEX "media_libraries_media_items_media_id_file_path_key" ON "media_libraries_media_items"("media_id", "file_path");

-- AddForeignKey
ALTER TABLE "media_libraries_media" ADD CONSTRAINT "media_libraries_media_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "media_libraries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_libraries_media_items" ADD CONSTRAINT "media_libraries_media_items_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_libraries_media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateSequence
CREATE SEQUENCE "media_libraries_id_seq";
ALTER SEQUENCE "media_libraries_id_seq" OWNED BY "media_libraries"."id";

-- CreateSequence
CREATE SEQUENCE "media_libraries_media_id_seq";
ALTER SEQUENCE "media_libraries_media_id_seq" OWNED BY "media_libraries_media"."id";

-- CreateSequence
CREATE SEQUENCE "media_libraries_media_items_id_seq";
ALTER SEQUENCE "media_libraries_media_items_id_seq" OWNED BY "media_libraries_media_items"."id";
