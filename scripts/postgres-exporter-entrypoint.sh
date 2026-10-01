#!/bin/sh
PASSWORD=$(cat /run/secrets/db_password)
export DATA_SOURCE_NAME="postgresql://${POSTGRES_USER:-vardiya}:${PASSWORD}@postgres:5432/${POSTGRES_DB:-vardiyasystem}?sslmode=disable"
exec /bin/postgres_exporter
