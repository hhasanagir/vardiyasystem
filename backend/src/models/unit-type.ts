import { UnitType } from '@prisma/client';

/**
 * Whether the given string is a member of the UnitType enum.
 *
 * Used to guard user-supplied unit values BEFORE they reach a Prisma query:
 * passing a non-enum string to a `type` field would raise a
 * PrismaClientValidationError (500) instead of a controlled 4xx response.
 */
export function isValidUnitType(value: string): value is UnitType {
  if (!value) return false;
  return (Object.values(UnitType) as string[]).includes(value);
}

/** Lowercased member set of the UnitType enum. */
export function unitTypeValues(): string[] {
  return Object.values(UnitType) as string[];
}