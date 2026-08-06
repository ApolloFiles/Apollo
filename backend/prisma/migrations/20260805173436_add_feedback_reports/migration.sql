-- CreateEnum
CREATE TYPE "feedback_report_category" AS ENUM ('BUG', 'FEEDBACK');

-- CreateEnum
CREATE TYPE "feedback_report_status" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'WONT_FIX');

-- CreateTable
CREATE TABLE "feedback_reports" (
    "id" TEXT NOT NULL DEFAULT apollo_nanoid(19),
    "user_id" TEXT NOT NULL,
    "category" "feedback_report_category" NOT NULL,
    "message" VARCHAR(4000) NOT NULL,
    "context" JSONB,
    "app_version" TEXT NOT NULL,
    "status" "feedback_report_status" NOT NULL DEFAULT 'OPEN',
    "admin_note" VARCHAR(4000),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "feedback_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_reports_user_id_idx" ON "feedback_reports"("user_id");

-- CreateIndex
CREATE INDEX "feedback_reports_created_at_idx" ON "feedback_reports"("created_at");

-- AddForeignKey
ALTER TABLE "feedback_reports" ADD CONSTRAINT "feedback_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
