import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { normalizeExpectedVersion } from '../version-precondition';

/**
 * The `?expectedVersion` precondition is the only optimistic-concurrency guard on
 * legacy schedule mutations, and it reaches the controller through a global
 * `transform: true` ValidationPipe. Two coercion artefacts matter:
 *
 *  - an ABSENT query parameter becomes `''` for a string metatype, and
 *  - the same absence becomes `NaN` once it is read as a number.
 *
 * Both must keep the legacy (non-CAS) behaviour, while a genuinely malformed
 * value is a client error (400) and never a Prisma 500.
 */
describe('normalizeExpectedVersion — ?expectedVersion precondition', () => {
  describe('absent values keep the legacy non-CAS behaviour', () => {
    it.each([
      ['undefined', undefined],
      ['null', null],
      ['empty string (ValidationPipe artefact)', ''],
      ['whitespace only', '   '],
      ['NaN (numeric coercion artefact)', Number.NaN],
      // `?expectedVersion[]` reaches the handler as ['']; String([]) is '' and
      // an empty query value is exactly the "not sent" case.
      ['empty array (bracketed query artefact)', []],
    ])('returns undefined for %s', (_label, raw) => {
      expect(normalizeExpectedVersion(raw)).toBeUndefined();
    });
  });

  describe('accepted values', () => {
    it.each([
      [0, 0],
      [1, 1],
      [42, 42],
      ['0', 0],
      ['7', 7],
      [' 12 ', 12],
      ['1024', 1024],
    ])('normalises %s to %s', (raw, expected) => {
      expect(normalizeExpectedVersion(raw)).toBe(expected);
    });
  });

  describe('malformed values are 400, never a Prisma 500', () => {
    it.each([
      ['negative number', -1],
      ['negative string', '-1'],
      ['fractional number', 1.5],
      ['fractional string', '1.5'],
      ['non-numeric string', 'seven'],
      ['scientific notation', '1e3'],
      ['hex string', '0x10'],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['object', {}],
      ['repeated parameter', ['7', '7']],
      ['NaN string', 'NaN'],
    ])('rejects %s with BadRequestException', (_label, raw) => {
      expect(() => normalizeExpectedVersion(raw)).toThrow(BadRequestException);
      try {
        normalizeExpectedVersion(raw);
      } catch (error) {
        expect((error as BadRequestException).getStatus()).toBe(400);
        expect((error as BadRequestException).message).toContain('expectedVersion');
      }
    });
  });

  it('is idempotent: a normalised value passes through unchanged', () => {
    const once = normalizeExpectedVersion('7');
    expect(normalizeExpectedVersion(once)).toBe(once);
  });
});
