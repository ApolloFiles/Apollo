-- CreateIndex
CREATE INDEX "auth_users_created_at_idx" ON "auth_users"("created_at");

-- AddForeignKey
ALTER TABLE "media_libraries" ADD CONSTRAINT "media_libraries_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_libraries_shared_with" ADD CONSTRAINT "media_libraries_shared_with_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_libraries_user_watch_progress" ADD CONSTRAINT "media_libraries_user_watch_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
