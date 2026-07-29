export interface SaleForCalc {
  date: string;
  total_revenue: number;
  payment_status: string;
  amount_paid: number;
}

export interface OpexSummaryForCalc {
  opexFixedAmt: number;
  staffSalaryAmt: number;
  taxAmt: number;
  rentalIncomeAmt: number;
}

export interface OverviewTotals {
  serviceRevenue: number;
  totalRevenue: number;
  totalCashCollected: number;
  totalOutstanding: number;
  grandExpenses: number;
  netProfit: number;
}

/** กำไรสุทธิคำนวณแบบเงินสด (cash basis) — นับเฉพาะเงินที่ได้รับจริงในช่วงที่เลือก ไม่ใช่ยอดขายที่ตั้งบิลไว้
 *  แต่ยังไม่ได้เก็บเงิน (ดู CLAUDE.md หัวข้อแท็บภาพรวม) — แยกออกมาเป็นฟังก์ชัน pure ล้วนเพื่อเทสได้ง่าย
 *  เพราะเป็นจุดที่เคยคำนวณผิดมาแล้วครั้งหนึ่งในเซสชันนี้ */
export function computeOverviewTotals(
  sales: SaleForCalc[],
  opexSummary: OpexSummaryForCalc,
  stockInAmt: number,
  laterPaymentsBySaleDate: Map<string, number>,
  inRangePaymentsTotal: number,
): OverviewTotals {
  const serviceRevenue = sales.reduce((s, r) => s + r.total_revenue, 0);
  const totalRevenue = serviceRevenue + opexSummary.rentalIncomeAmt;

  let totalCashCollected = 0;
  let totalOutstanding = 0;
  sales.forEach((s) => {
    const pStatus = s.payment_status || 'ชำระครบ';
    const receivedAtSaleTime = pStatus === 'ชำระครบ' ? s.total_revenue : Math.min(s.amount_paid || 0, s.total_revenue);
    totalCashCollected += receivedAtSaleTime;
    const laterCollected = laterPaymentsBySaleDate.get(s.date) || 0;
    totalOutstanding += Math.max(s.total_revenue - receivedAtSaleTime - laterCollected, 0);
  });
  totalCashCollected += inRangePaymentsTotal;

  const grandExpenses = stockInAmt + opexSummary.opexFixedAmt + opexSummary.staffSalaryAmt + opexSummary.taxAmt;
  const netProfit = totalCashCollected + opexSummary.rentalIncomeAmt - grandExpenses;

  return { serviceRevenue, totalRevenue, totalCashCollected, totalOutstanding, grandExpenses, netProfit };
}
