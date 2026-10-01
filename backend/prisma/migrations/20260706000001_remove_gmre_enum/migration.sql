-- Remove gmre from UnitType enum
-- Create new enum type without gmre
CREATE TYPE "UnitType_new" AS ENUM ('mr', 'bt', 'rontgen', 'nukleer', 'onkoloji', 'ultrason', 'anjiyo', 'mamografi', 'kemik_dansitometri', 'floroskopi', 'pet_ct', 'spect_ct', 'linak', 'simutasyon_ct', 'mobil');

-- Alter the column type
ALTER TABLE "units" ALTER COLUMN "type" TYPE "UnitType_new" USING ("type"::text::"UnitType_new");

-- Drop old enum type
DROP TYPE "UnitType";

-- Rename new type
ALTER TYPE "UnitType_new" RENAME TO "UnitType";
