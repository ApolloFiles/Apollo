-- CreateTable
CREATE TABLE "auth_access_tokens" (
    "id" BIGINT NOT NULL DEFAULT generate_snowflake('auth_access_tokens_id_seq'::text),
    "user_id" TEXT NOT NULL,
    "hashed_token" BYTEA,
    "token_hint" VARCHAR(32) NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "description" VARCHAR(4000),
    "lifetime_seconds" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ,
    "rotated_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "rough_last_used_at" TIMESTAMPTZ,

    CONSTRAINT "auth_access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_access_tokens_hashed_token_key" ON "auth_access_tokens"("hashed_token");

-- CreateIndex
CREATE INDEX "auth_access_tokens_user_id_idx" ON "auth_access_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "auth_access_tokens" ADD CONSTRAINT "auth_access_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateSequence
CREATE SEQUENCE "auth_access_tokens_id_seq";
ALTER SEQUENCE "auth_access_tokens_id_seq" OWNED BY "auth_access_tokens"."id";
