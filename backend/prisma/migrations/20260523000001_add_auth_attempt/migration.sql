-- CreateTable: AuthAttempt for brute force protection and lockout tracking
CREATE TABLE "auth_attempts" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "attempt_type" TEXT NOT NULL DEFAULT 'LOGIN',
    "success" BOOLEAN NOT NULL DEFAULT false,
    "lockout_until" TIMESTAMP(3),
    "jti" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auth_attempts_email_created_at_idx" ON "auth_attempts"("email", "created_at");
CREATE INDEX "auth_attempts_ip_address_created_at_idx" ON "auth_attempts"("ip_address", "created_at");
CREATE INDEX "auth_attempts_created_at_idx" ON "auth_attempts"("created_at");
CREATE INDEX "auth_attempts_jti_idx" ON "auth_attempts"("jti");
