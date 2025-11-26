-- CreateIndex
CREATE INDEX "accounts_userId_idx" ON "better_auth"."accounts"("userId");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "better_auth"."sessions"("userId");

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "better_auth"."verifications"("identifier");
