-- CreateTable
CREATE TABLE "auth_users" (
    "id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_date" DATE,
    "last_activity_date" DATE,
    "profile_picture" BYTEA,

    CONSTRAINT "auth_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_linked_auth_providers" (
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "provider_user_display_name" TEXT,
    "provider_profile_picture" BYTEA,

    CONSTRAINT "auth_linked_auth_providers_pkey" PRIMARY KEY ("user_id","provider")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" BIGINT NOT NULL DEFAULT generate_snowflake('auth_sessions_id_seq'::text),
    "hashed_token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "user_agent" TEXT NOT NULL,
    "rough_last_activity" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_anonymous_sessions" (
    "hashed_token" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "auth_anonymous_sessions_pkey" PRIMARY KEY ("hashed_token")
);

-- CreateTable
CREATE TABLE "auth_account_creation_invite_tokens" (
    "hashed_token" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "auth_account_creation_invite_tokens_pkey" PRIMARY KEY ("hashed_token")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_linked_auth_providers_provider_provider_user_id_key" ON "auth_linked_auth_providers"("provider", "provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_hashed_token_key" ON "auth_sessions"("hashed_token");

-- AddForeignKey
ALTER TABLE "auth_linked_auth_providers" ADD CONSTRAINT "auth_linked_auth_providers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
