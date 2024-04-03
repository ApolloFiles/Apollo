-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateFunction
CREATE OR REPLACE FUNCTION basename(pathname text) RETURNS text
    PARALLEL SAFE
    IMMUTABLE
    RETURNS NULL ON NULL INPUT
AS $basename$
BEGIN
    return regexp_replace(trim(TRAILING FROM pathname, '/'), '^.+/', '');
END
$basename$ LANGUAGE plpgsql;

-- CreateTable
CREATE TABLE "files_search_index" (
    "owner_id" BIGINT NOT NULL,
    "filesystem" VARCHAR(512) NOT NULL,
    "file_path" TEXT NOT NULL,
    "is_directory" BOOLEAN NOT NULL,
    "size_bytes" BIGINT,
    "sha256" BYTEA,
    "last_modified_at" TIMESTAMPTZ NOT NULL,
    "last_validation" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_search_index_pkey" PRIMARY KEY ("owner_id","filesystem","file_path")
);

-- CreateIndex
CREATE INDEX "files_search_index_file_path_idx" ON "files_search_index" USING GIN ("file_path" gin_trgm_ops);

-- CreateIndex
CREATE INDEX files_search_index_file_basename_gin_idx ON files_search_index USING gin (basename(file_path) gin_trgm_ops);
