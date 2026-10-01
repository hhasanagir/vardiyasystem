#!/usr/bin/env bash
# VardiyaOS — Migration Baseline Script
# Run this once on existing databases that were created with `prisma db push`
# to mark the baseline migration as already applied.
#
# Usage:
#   ./scripts/migrate-baseline.sh
#
# Prerequisites:
#   - DATABASE_URL must be set in backend/.env or environment
#   - Node.js dependencies must be installed (npm ci)

set -euo pipefail

echo "VardiyaOS — Migration Baseline Setup"
echo "===================================="
echo ""

# Step 1: Generate Prisma Client
echo "[1/3] Generating Prisma Client..."
npx prisma generate
echo "  Done."

# Step 2: Mark baseline as applied (idempotent)
echo "[2/3] Marking baseline migration as applied..."
BASELINE="20260519000000_v1_initial_baseline"
npx prisma migrate resolve --applied "$BASELINE" 2>&1 || echo "  Note: May already be applied."
echo "  Done."

# Step 3: Verify
echo "[3/3] Verifying migration status..."
npx prisma migrate status
echo ""
echo "Baseline setup complete!"
echo "From now on, use: npx prisma migrate deploy"
