-- AlterTable
ALTER TABLE "auth_users" ALTER COLUMN "last_login_date" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "last_activity_date" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
-- Because of timezones we need hourly precision, instead of daily precision
ALTER TABLE
    "auth_users"
    ADD CHECK (
        "last_login_date" = date_trunc('hour', "last_login_date")
        ),
    ADD CHECK (
        "last_activity_date" = date_trunc('hour', "last_activity_date")
        );
