-- truncate the table, because csrf_token column is added and does not have a default value
TRUNCATE TABLE "auth_sessions";

-- AlterTable
ALTER TABLE "auth_sessions" ADD COLUMN     "csrf_token" TEXT NOT NULL;
