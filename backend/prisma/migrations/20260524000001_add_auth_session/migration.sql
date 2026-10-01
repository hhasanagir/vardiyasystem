-- AlterTable: add userId to auth_attempts for refresh token logging
ALTER TABLE "auth_attempts" ADD COLUMN "user_id" TEXT;

-- CreateIndex
CREATE INDEX "auth_attempts_user_id_created_at_idx" ON "auth_attempts"("user_id", "created_at");

-- CreateTable: AuthSession for persistent refresh token management and session revocation
CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "hashed_token" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "device_info" TEXT,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_jti_key" ON "auth_sessions"("jti");
CREATE INDEX "auth_sessions_user_id_revoked_at_idx" ON "auth_sessions"("user_id", "revoked_at");
CREATE INDEX "auth_sessions_hashed_token_idx" ON "auth_sessions"("hashed_token");
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
