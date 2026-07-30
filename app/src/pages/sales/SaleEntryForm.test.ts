import { describe, expect, it } from 'vitest';
import { paymentStatusFor } from './SaleEntryForm';

describe('paymentStatusFor', () => {
  it('reproduces the exact example from the request: 10 pairs size S at 200 baht, 1,600 received', () => {
    const total = 10 * 200; // 2000
    const received = 1600;
    expect(paymentStatusFor(received, total)).toBe('ชำระบางส่วน');
    expect(total - received).toBe(400);
  });

  it('is ชำระครบ when the full amount (or more) is received', () => {
    expect(paymentStatusFor(2000, 2000)).toBe('ชำระครบ');
    expect(paymentStatusFor(2100, 2000)).toBe('ชำระครบ');
  });

  it('is ค้างชำระ when nothing has been received yet', () => {
    expect(paymentStatusFor(0, 2000)).toBe('ค้างชำระ');
  });

  it('treats a zero-total draft (nothing entered yet) as ชำระครบ rather than a spurious partial state', () => {
    expect(paymentStatusFor(0, 0)).toBe('ชำระครบ');
  });
});
