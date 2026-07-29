import { describe, expect, it } from 'vitest';
import { normalizeDate } from './importExport';

describe('normalizeDate', () => {
  it('accepts a plain YYYY-MM-DD string', () => {
    expect(normalizeDate('2026-07-13')).toBe('2026-07-13');
  });

  it('rejects other text formats instead of silently parsing them wrong', () => {
    expect(normalizeDate('13/07/2026')).toBeNull();
    expect(normalizeDate('July 13 2026')).toBeNull();
  });

  it('converts a real Excel date cell (JS Date, when cellDates:true) to YYYY-MM-DD', () => {
    // เดือนใน JS Date นับจาก 0 (0=ม.ค.) — เคยเป็นจุดพลาดง่ายเวลาแปลง
    expect(normalizeDate(new Date(2026, 6, 13))).toBe('2026-07-13');
    expect(normalizeDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('rejects an invalid Date object', () => {
    expect(normalizeDate(new Date('not a date'))).toBeNull();
  });

  it('rejects empty/undefined input', () => {
    expect(normalizeDate(undefined)).toBeNull();
    expect(normalizeDate('')).toBeNull();
  });
});
