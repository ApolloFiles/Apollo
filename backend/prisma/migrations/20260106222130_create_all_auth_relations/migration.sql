-- CreateTable
CREATE TABLE "auth_users" (
    "id" TEXT NOT NULL DEFAULT apollo_nanoid(19),
    "display_name" VARCHAR(50) NOT NULL,
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "is_super_user" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_date" TIMESTAMPTZ,
    "last_activity_date" TIMESTAMPTZ,
    "profile_picture" BYTEA,

    CONSTRAINT "auth_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_users_linked_providers" (
    "user_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "provider_user_display_name" TEXT,
    "provider_user_profile_picture" BYTEA,
    "linked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_users_linked_providers_pkey" PRIMARY KEY ("user_id","provider_id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" BIGINT NOT NULL DEFAULT generate_snowflake('auth_sessions_id_seq'::text),
    "hashed_token" BYTEA NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "user_agent" TEXT NOT NULL,
    "rough_last_activity" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_anonymous_sessions" (
    "hashed_token" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL DEFAULT (now() + '00:10:00'::interval),
    "data" JSONB NOT NULL,

    CONSTRAINT "auth_anonymous_sessions_pkey" PRIMARY KEY ("hashed_token")
);

-- CreateTable
CREATE TABLE "auth_account_creation_invite_tokens" (
    "hashed_token" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "createSuperUserAccount" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "auth_account_creation_invite_tokens_pkey" PRIMARY KEY ("hashed_token")
);

-- CreateIndex
CREATE INDEX "auth_users_created_at_idx" ON "auth_users"("created_at");

-- CreateIndex
CREATE INDEX "auth_users_linked_providers_user_id_idx" ON "auth_users_linked_providers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_users_linked_providers_provider_id_provider_user_id_key" ON "auth_users_linked_providers"("provider_id", "provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_hashed_token_key" ON "auth_sessions"("hashed_token");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "auth_anonymous_sessions_expires_at_idx" ON "auth_anonymous_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "auth_account_creation_invite_tokens_expires_at_idx" ON "auth_account_creation_invite_tokens"("expires_at");

-- AddForeignKey
ALTER TABLE "auth_users_linked_providers" ADD CONSTRAINT "auth_users_linked_providers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateSequence
CREATE SEQUENCE "auth_sessions_id_seq";
ALTER SEQUENCE "auth_sessions_id_seq" OWNED BY "auth_sessions"."id";
