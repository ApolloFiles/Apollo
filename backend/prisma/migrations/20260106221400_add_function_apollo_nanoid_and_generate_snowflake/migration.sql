-- CreateFunction
CREATE OR REPLACE FUNCTION apollo_nanoid(
    size int DEFAULT 21
)
    RETURNS text
    LANGUAGE plpgsql
    VOLATILE
    PARALLEL SAFE
AS
$$
DECLARE
BEGIN
    RETURN nanoid(size, '_0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 1.0);
END
$$;

-- CreateFunction
CREATE OR REPLACE FUNCTION generate_snowflake(seq text, shard_id integer DEFAULT 1, OUT snowflake bigint) RETURNS bigint
    LANGUAGE plpgsql
AS
$$
DECLARE
    our_epoch  bigint := 1708214400000; -- 2024-02-18 00:00:00 UTC
    seq_id     bigint;
    now_millis bigint;
    -- the id of this DB shard, must be set for each
    -- schema shard you have - you could pass this as a parameter too
    -- shard_id   int    := 1;
BEGIN
    SELECT nextval(seq) % 1024 INTO seq_id;

    SELECT floor(extract(EPOCH FROM clock_timestamp()) * 1000) INTO now_millis;
    snowflake := (now_millis - our_epoch) << 23;
    snowflake := snowflake | (shard_id << 10);
    snowflake := snowflake | (seq_id);
END;
$$;
