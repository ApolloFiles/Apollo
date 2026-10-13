-- CreateTable
CREATE TABLE "cache_app_entries" (
    "id" BIGINT NOT NULL DEFAULT generate_snowflake('cache_app_entries_id_seq'::text),
    "namespace" VARCHAR(100) NOT NULL,
    "version" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "file_id" UUID,
    "is_null" BOOLEAN NOT NULL,
    "group_key" TEXT,
    "size_bytes" BIGINT NOT NULL,
    "content_type" VARCHAR(255),
    "validator" VARCHAR(255),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fresh_until" TIMESTAMPTZ,
    "keep_until" TIMESTAMPTZ,
    "last_accessed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cache_app_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cache_user_entries" (
    "id" BIGINT NOT NULL DEFAULT generate_snowflake('cache_user_entries_id_seq'::text),
    "user_id" TEXT NOT NULL,
    "namespace" VARCHAR(100) NOT NULL,
    "version" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "file_id" UUID,
    "is_null" BOOLEAN NOT NULL,
    "group_key" TEXT,
    "size_bytes" BIGINT NOT NULL,
    "content_type" VARCHAR(255),
    "validator" VARCHAR(255),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fresh_until" TIMESTAMPTZ,
    "keep_until" TIMESTAMPTZ,
    "last_accessed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cache_user_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cache_app_entries_file_id_key" ON "cache_app_entries"("file_id");

-- CreateIndex
CREATE INDEX "cache_app_entries_keep_until_idx" ON "cache_app_entries"("keep_until") WHERE "keep_until" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "cache_app_entries_namespace_version_key_key" ON "cache_app_entries"("namespace", "version", "key");

-- CreateIndex
CREATE UNIQUE INDEX "cache_user_entries_file_id_key" ON "cache_user_entries"("file_id");

-- CreateIndex
CREATE INDEX "cache_user_entries_namespace_version_idx" ON "cache_user_entries"("namespace", "version");

-- CreateIndex
CREATE INDEX "cache_user_entries_keep_until_idx" ON "cache_user_entries"("keep_until") WHERE "keep_until" IS NOT NULL;

-- CreateIndex
CREATE INDEX "cache_user_entries_user_id_group_key_idx" ON "cache_user_entries"("user_id", "group_key" text_pattern_ops);

-- CreateIndex
CREATE UNIQUE INDEX "cache_user_entries_user_id_namespace_version_key_key" ON "cache_user_entries"("user_id", "namespace", "version", "key");

-- AddForeignKey
ALTER TABLE "cache_user_entries" ADD CONSTRAINT "cache_user_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateSequence
CREATE SEQUENCE "cache_app_entries_id_seq";
ALTER SEQUENCE "cache_app_entries_id_seq" OWNED BY "cache_app_entries"."id";

-- CreateSequence
CREATE SEQUENCE "cache_user_entries_id_seq";
ALTER SEQUENCE "cache_user_entries_id_seq" OWNED BY "cache_user_entries"."id";
