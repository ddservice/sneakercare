import { describe, expect, it } from 'vitest';
import { computeNet, computeSso, computeWht } from './payroll';

describe('computeSso', () => {
  it('takes 5% of salary when at or below the 15,000 SSO cap', () => {
    expect(computeSso(10000)).toBe(500);
    expect(computeSso(15000)).toBe(750);
  });

  it('caps the base at 15,000 even for higher salaries', () => {
    expect(computeSso(30000)).toBe(750);
  });

  it('rounds to the nearest baht', () => {
    expect(computeSso(12345)).toBe(Math.round(12345 * 0.05));
  });
});

describe('computeWht', () => {
  it('takes 3% of commission only', () => {
    expect(computeWht(1000)).toBe(30);
  });

  it('is zero when there is no commission', () => {
    expect(computeWht(0)).toBe(0);
  });
});

describe('computeNet', () => {
  it('matches the manual example verified against the legacy app this session', () => {
    // เงินเดือน 12000, ไม่มีคอม, ไม่มีเบี้ยขยัน/OT, ไม่มีรายการหักอื่น
    // ปกส. = round(12000*0.05) = 600, WHT = 0 (ไม่มีคอม)
    const net = computeNet(12000, 0, 0, 0, 0);
    expect(net).toBe(12000 - 600);
  });

  it('deducts SSO, WHT (on commission only), and manual deductions from gross earnings', () => {
    const salary = 12000;
    const commission = 2000;
    const diligence = 500;
    const ot = 300;
    const deductTotal = 200;
    const net = computeNet(salary, commission, diligence, ot, deductTotal);
    const expectedSso = computeSso(salary);
    const expectedWht = computeWht(commission);
    expect(net).toBe(salary + commission + diligence + ot - expectedSso - expectedWht - deductTotal);
  });
});
