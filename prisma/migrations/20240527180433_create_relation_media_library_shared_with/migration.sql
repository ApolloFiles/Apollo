-- CreateTable
CREATE TABLE "media_libraries_shared_with" (
    "library_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,

    CONSTRAINT "media_libraries_shared_with_pkey" PRIMARY KEY ("library_id","user_id")
);

-- AddForeignKey
ALTER TABLE "media_libraries_shared_with" ADD CONSTRAINT "media_libraries_shared_with_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "media_libraries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
