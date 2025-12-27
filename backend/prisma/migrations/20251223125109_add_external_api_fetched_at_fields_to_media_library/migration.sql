-- AlterTable
ALTER TABLE "media_libraries_media" ADD COLUMN     "external_api_fetched_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "media_libraries_media_items" ADD COLUMN     "external_api_fetched_at" TIMESTAMPTZ;
