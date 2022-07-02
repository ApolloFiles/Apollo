CREATE EXTENSION pg_trgm;


CREATE OR REPLACE FUNCTION basename(pathname text) RETURNS text
    PARALLEL SAFE
    IMMUTABLE
    RETURNS NULL ON NULL INPUT
AS $basename$
BEGIN
    return regexp_replace(trim(TRAILING FROM pathname, '/'), '^.+/', '');
END
$basename$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION count_estimate(query text) RETURNS integer
    VOLATILE
    RETURNS NULL ON NULL INPUT
AS $count_estimate$
DECLARE
    rec  record;
    rows integer;
BEGIN
    FOR rec IN EXECUTE 'EXPLAIN ' || query LOOP
            rows := substring(rec."QUERY PLAN" FROM ' rows=([[:digit:]]+)');
            EXIT WHEN rows IS NOT NULL;
        END LOOP;
-- this useless comment can be removed, just here for to-do-highlighting to work
    RETURN rows;
END
$count_estimate$ LANGUAGE plpgsql;


/*
 Tables
 */


-- auto-generated definition
create table user_file_index
(
    owner_id          bigint                                             not null,
    filesystem        varchar(512)                                       not null,
    file_path         text                                               not null,
    is_directory      boolean                                            not null,
    size_bytes        bigint,
    sha256            bytea,
    last_modification timestamp with time zone                           not null,
    last_validation   timestamp with time zone default CURRENT_TIMESTAMP not null,
    constraint user_file_index_pk
        primary key (owner_id, filesystem, file_path)
);

create index on user_file_index using gin (file_path gin_trgm_ops);

create index on user_file_index using gin (basename(file_path) gin_trgm_ops);
