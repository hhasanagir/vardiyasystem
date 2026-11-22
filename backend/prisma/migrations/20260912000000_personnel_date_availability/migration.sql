-- CreateEnum
CREATE TYPE "PersonnelAvailabilityType" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'LEAVE', 'ABSENCE');

-- CreateTable
CREATE TABLE "personnel_date_availability" (
    "id" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "type" "PersonnelAvailabilityType" NOT NULL,
    "reason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personnel_date_availability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "personnel_date_availability_personnelId_date_key" ON "personnel_date_availability"("personnelId", "date");

-- CreateIndex
CREATE INDEX "personnel_date_availability_personnelId_date_idx" ON "personnel_date_availability"("personnelId", "date");

-- CreateIndex
CREATE INDEX "personnel_date_availability_date_idx" ON "personnel_date_availability"("date");

-- AddForeignKey
ALTER TABLE "personnel_date_availability" ADD CONSTRAINT "personnel_date_availability_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;