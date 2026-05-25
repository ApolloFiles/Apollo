-- CreateTable
CREATE TABLE "media_libraries_user_preferences" (
    "user_id" TEXT NOT NULL,
    "library_id" BIGINT NOT NULL,
    "preference_id" INTEGER NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "media_libraries_user_preferences_pkey" PRIMARY KEY ("user_id","library_id","preference_id")
);

-- AddForeignKey
ALTER TABLE "media_libraries_user_preferences" ADD CONSTRAINT "media_libraries_user_preferences_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "media_libraries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_libraries_user_preferences" ADD CONSTRAINT "media_libraries_user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
