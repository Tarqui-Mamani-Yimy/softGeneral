-- 001: extensions and enum types shared by the schema.
-- Files in database/init run in lexical order on the FIRST start of an empty
-- database volume (docker-entrypoint-initdb.d). See database/README.md.

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;    -- case-insensitive email / username

CREATE TYPE camera_source_type AS ENUM ('rtsp', 'webcam', 'file');

CREATE TYPE zone_type AS ENUM ('field', 'authorized', 'stands', 'restricted');

CREATE TYPE video_job_status AS ENUM ('queued', 'processing', 'completed', 'failed', 'cancelled');

CREATE TYPE alert_type AS ENUM ('intrusion', 'weapon', 'fire_smoke', 'fight', 'face_match');

CREATE TYPE alert_status AS ENUM ('pending', 'confirmed', 'false_alarm');
