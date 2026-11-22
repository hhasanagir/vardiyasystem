-- CreateTable
CREATE TABLE "device_off_dates" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "reason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_off_dates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_off_dates_deviceId_date_key" ON "device_off_dates"("deviceId", "date");

-- CreateIndex
CREATE INDEX "device_off_dates_deviceId_date_idx" ON "device_off_dates"("deviceId", "date");

-- AddForeignKey
ALTER TABLE "device_off_dates" ADD CONSTRAINT "device_off_dates_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_off_dates" ADD CONSTRAINT "device_off_dates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
