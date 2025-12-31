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
