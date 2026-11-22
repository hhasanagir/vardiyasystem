import { BadRequestException } from '@nestjs/common';

/**
 * Normalises the optimistic-concurrency precondition before it reaches Prisma.
 *
 * With a global `transform: true` ValidationPipe, Nest's primitive-metatype
 * coercion rewrites an ABSENT `?expectedVersion` into `''` or `NaN`, so those
 * two artefacts (plus `undefined`/`null`) all mean "the client did not send
 * ?expectedVersion" and must keep the legacy (non-CAS) behaviour. Anything else
 * has to be a non-negative integer: a malformed value is a client error (400),
 * never a Prisma validation error that would surface as a 500.
 */
export function normalizeExpectedVersion(raw: unknown): number | undefined {
  if (raw === undefined || raw === null) return undefined;

  if (typeof raw === 'number') {
    // NaN can only be the coercion artefact of a missing query parameter.
    if (Number.isNaN(raw)) return undefined;
    if (!Number.isInteger(raw) || raw < 0) {
      throw new BadRequestException('expectedVersion pozitif tam sayı olmalıdır');
    }
    return raw;
  }

  const text = String(raw).trim();
  if (text === '') return undefined;
  if (!/^\d+$/.test(text)) {
    throw new BadRequestException('expectedVersion pozitif tam sayı olmalıdır');
  }
  return Number(text);
}
