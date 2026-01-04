-- AlterTable
ALTER TABLE "auth_sessions" ALTER COLUMN "rough_last_activity" DROP DEFAULT;

-- AlterTable
ALTER TABLE
    "auth_sessions"
    ADD CHECK (
        "rough_last_activity" = date_trunc('hour', "rough_last_activity")
    );
