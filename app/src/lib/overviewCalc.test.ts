import { describe, expect, it } from 'vitest';
import { computeOverviewTotals, type OpexSummaryForCalc, type SaleForCalc } from './overviewCalc';

const emptyOpex: OpexSummaryForCalc = { opexFixedAmt: 0, staffSalaryAmt: 0, taxAmt: 0, rentalIncomeAmt: 0 };
const noLaterPayments = new Map<string, number>();

describe('computeOverviewTotals', () => {
  it('counts a fully-paid sale entirely as cash collected this period', () => {
    const sales: SaleForCalc[] = [{ date: '2026-07-01', total_revenue: 1000, payment_status: 'ชำระครบ', amount_paid: 1000 }];
    const totals = computeOverviewTotals(sales, emptyOpex, 0, noLaterPayments, 0);
    expect(totals.totalCashCollected).toBe(1000);
    expect(totals.totalOutstanding).toBe(0);
    expect(totals.netProfit).toBe(1000);
  });

  it('reproduces the real 400-baht discrepancy this session traced to two partially-paid sales', () => {
    // 11 ก.ค.: total 2200 / paid 2000 -> ค้าง 200 ; 9 ก.ค.: total 2000 / paid 1800 -> ค้าง 200
    // รวมค้าง 400 บาท ที่เคยถูกรายงานว่า "เงินสดรับจริงยอดหายไป 400 บาท" แต่จริงๆ ระบบทำงานถูกต้อง
    // (ก่อนแก้ ระบบเคยนับ 400 นี้เป็นกำไรทั้งที่ยังไม่ได้เก็บเงินจริง)
    const sales: SaleForCalc[] = [
      { date: '2026-07-09', total_revenue: 2000, payment_status: 'ชำระบางส่วน', amount_paid: 1800 },
      { date: '2026-07-11', total_revenue: 2200, payment_status: 'ชำระบางส่วน', amount_paid: 2000 },
    ];
    const totals = computeOverviewTotals(sales, emptyOpex, 0, noLaterPayments, 0);
    expect(totals.totalCashCollected).toBe(1800 + 2000);
    expect(totals.totalOutstanding).toBe(400);
    expect(totals.netProfit).toBe(3800);
  });

  it('does not double-count a later payment collected in-period against the same sale twice', () => {
    // ยอดขายวันที่ 1 ก.ค. ค้างชำระตอนขาย แต่มารับเงินเพิ่มทีหลังในช่วงเดียวกัน (paymentsInRange)
    // ต้องนับเงินที่ได้รับจริงแค่ครั้งเดียว ไม่ใช่ทั้งตอนขายและตอนรับเพิ่ม
    const sales: SaleForCalc[] = [{ date: '2026-07-01', total_revenue: 1000, payment_status: 'ค้างชำระ', amount_paid: 0 }];
    const laterPayments = new Map([['2026-07-01', 1000]]);
    const totals = computeOverviewTotals(sales, emptyOpex, 0, laterPayments, 1000);
    // received-at-sale-time (0) + the later payment counted via inRangePaymentsTotal (1000) = 1000 total collected
    expect(totals.totalCashCollected).toBe(1000);
    // outstanding subtracts the later-collected amount regardless of the period filter, so it nets to 0
    expect(totals.totalOutstanding).toBe(0);
  });

  it('adds rental income to both revenue and profit, and subtracts all expense categories', () => {
    const sales: SaleForCalc[] = [{ date: '2026-07-01', total_revenue: 1000, payment_status: 'ชำระครบ', amount_paid: 1000 }];
    const opex: OpexSummaryForCalc = { opexFixedAmt: 100, staffSalaryAmt: 200, taxAmt: 50, rentalIncomeAmt: 300 };
    const totals = computeOverviewTotals(sales, opex, 400, noLaterPayments, 0);
    expect(totals.totalRevenue).toBe(1000 + 300);
    expect(totals.grandExpenses).toBe(400 + 100 + 200 + 50);
    expect(totals.netProfit).toBe(1000 + 300 - (400 + 100 + 200 + 50));
  });

  it('never lets outstanding go negative when a later payment exceeds what was owed', () => {
    const sales: SaleForCalc[] = [{ date: '2026-07-01', total_revenue: 500, payment_status: 'ชำระบางส่วน', amount_paid: 400 }];
    const laterPayments = new Map([['2026-07-01', 999]]); // overpaid/adjusted later
    const totals = computeOverviewTotals(sales, emptyOpex, 0, laterPayments, 0);
    expect(totals.totalOutstanding).toBe(0);
  });
});
