-- CreateSequence
CREATE SEQUENCE "media_libraries_media_id_seq";
ALTER SEQUENCE "media_libraries_media_id_seq" OWNED BY "media_libraries_media"."id";

-- CreateSequence
CREATE SEQUENCE "media_libraries_media_items_id_seq";
ALTER SEQUENCE "media_libraries_media_items_id_seq" OWNED BY "media_libraries_media_items"."id";
