-- AddForeignKey
ALTER TABLE "media_libraries_user_watch_progress" ADD CONSTRAINT "media_libraries_user_watch_progress_media_item_id_fkey" FOREIGN KEY ("media_item_id") REFERENCES "media_libraries_media_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
