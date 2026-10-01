#!/bin/sh
export POSTGRESQL_PASSWORD=$(cat /run/secrets/db_password)
exec /opt/bitnami/scripts/pgbouncer/entrypoint.sh /opt/bitnami/scripts/pgbouncer/run.sh
