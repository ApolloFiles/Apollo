-- AlterTable
ALTER TABLE "auth_users" ADD COLUMN     "is_super_user" BOOLEAN NOT NULL DEFAULT false;
