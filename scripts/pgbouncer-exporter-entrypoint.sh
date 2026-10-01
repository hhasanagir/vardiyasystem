#!/bin/sh
PASSWORD=$(cat /run/secrets/db_password)
export PGBOUNCER_DSN="postgresql://${POSTGRES_USER:-vardiya}:${PASSWORD}@pgbouncer:6432/pgbouncer?sslmode=disable"
exec /bin/pgbouncer_exporter