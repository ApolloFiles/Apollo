-- CreateIndex
CREATE INDEX "auth_account_creation_invite_tokens_expires_at_idx" ON "auth_account_creation_invite_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "auth_anonymous_sessions_expires_at_idx" ON "auth_anonymous_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "auth_users_linked_providers_user_id_idx" ON "auth_users_linked_providers"("user_id");
