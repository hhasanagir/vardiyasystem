-- Enable ltree extension
-- WITH SCHEMA public (defect D18): an unqualified CREATE EXTENSION installs into
-- whatever search_path resolves to, so a deploy that is not pinned to `public`
-- ends up with the extension in another schema and every later unqualified
-- `ltree` type reference fails. Pin the install schema.
CREATE EXTENSION IF NOT EXISTS ltree WITH SCHEMA public;
