#!/usr/bin/env node
const {
  DEFAULT_REVENUE_BASIS,
  DASHBOARD_LOOKBACK_MONTHS,
  countsTowardDashboardRevenue,
  dashboardLookbackOpexMonths,
  dashboardLookbackStart,
  isPosTicketSale,
  planDashboardBooks,
} = await import(new URL("../.test-build/dashboard-books.js", import.meta.url).href);

let failures = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};
function check(cond, yes, no) {
  if (cond) ok(yes);
  else bad(no);
}

const monthInput = {
  period: "month",
  filterDate: "2026-08-15",
  customStartDate: "2026-08-01",
  customEndDate: "2026-08-31",
};

const sales = [
  {
    date: "2026-08-10",
    amount_paid: 1000,
    cash_amount: 1000,
    transfer_amount: 0,
    total_revenue: 1000,
    client_request_id: null,
  },
  {
    date: "2026-08-21",
    amount_paid: 0,
    cash_amount: 0,
    transfer_amount: 0,
    total_revenue: 2100,
    client_request_id: null,
  },
  {
    date: "2026-08-12",
    amount_paid: 500,
    cash_amount: 0,
    transfer_amount: 500,
    total_revenue: 500,
    client_request_id: "order-1",
  },
  {
    date: "2026-09-01",
    amount_paid: 800,
    cash_amount: 800,
    transfer_amount: 0,
    total_revenue: 800,
    client_request_id: "order-2",
  },
];

const payments = [{ sale_date: "2026-08-21", received_date: "2026-09-01", amount: 2100 }];

const opex = [
  { month: "08/2026", category: "ค่าดำเนินการ", key: "rent", name: "ค่าน้ำ", amount: 400, pay_method: "โอน" },
  { month: "08/2026", category: "rental_income", key: "room", name: "ค่าเช่าห้อง", amount: 6000, pay_method: "โอน" },
];

console.log("\n[dashboard-books] แหล่งรายได้");
check(DEFAULT_REVENUE_BASIS === "cash", "ค่าเริ่มต้นเป็นเงินเข้าจริง", `ได้ ${DEFAULT_REVENUE_BASIS}`);
check(countsTowardDashboardRevenue("sc_sales"), "sc_sales นับเป็นรายได้ภาพรวม", "sc_sales ไม่ถูกนับ");
check(countsTowardDashboardRevenue("sc_payments"), "sc_payments นับเป็นรายได้ภาพรวม", "sc_payments ไม่ถูกนับ");
check(!countsTowardDashboardRevenue("service_orders"), "service_orders ไม่นับเป็นรายได้", "ใบรับงานถูกนับเป็นรายได้");
check(!countsTowardDashboardRevenue("ext_documents"), "เอกสารขายไม่นับเป็นรายได้ภาพรวม", "เอกสารขายถูกนับ");
check(isPosTicketSale({ client_request_id: "order-1" }), "แถวที่มีคีย์ใบรับงานคืองานจาก /pos", "ไม่จำแนกใบรับงาน");
check(!isPosTicketSale({ client_request_id: null }), "แถวไม่มีคีย์คือยอดขายรายวัน", "แถวว่างถูกนับเป็น POS");

console.log("\n[dashboard-books] เงินเข้าจริงเดือน ส.ค.");
const cash = planDashboardBooks({ ...monthInput, sales, opex, payments, revenueBasis: "cash" });
check(cash.paidOnBills === 1500, "จ่ายตอนออกบิล = 1500", `ได้ ${cash.paidOnBills}`);
check(cash.arReceived === 0, "โอน 1 ก.ย. ไม่เข้าเงิน ส.ค.", `ได้ ${cash.arReceived}`);
check(cash.cashRevenueForPeriod === 1500, "เงินเข้าบริการ ส.ค. = 1500", `ได้ ${cash.cashRevenueForPeriod}`);
check(cash.billRevenueForPeriod === 3600, "ตามบิล ส.ค. = 3600", `ได้ ${cash.billRevenueForPeriod}`);
check(cash.outstandingForPeriod === 2100, "ค้างชำระ ส.ค. ยังเป็น 2100", `ได้ ${cash.outstandingForPeriod}`);
check(cash.posTicketPaid === 500, "จากใบรับงานที่ชำระแล้ว = 500", `ได้ ${cash.posTicketPaid}`);
check(cash.dailyEntryPaid === 1000, "จากยอดขายรายวัน = 1000", `ได้ ${cash.dailyEntryPaid}`);
check(cash.posTicketCount === 1, "นับ 1 ใบรับงานในเดือน", `ได้ ${cash.posTicketCount}`);
check(cash.rentalIncomeForPeriod === 6000, "ค่าเช่าห้อง = 6000", `ได้ ${cash.rentalIncomeForPeriod}`);
check(cash.totalExpensesForPeriod === 400, "ค่าใช้จ่าย = 400", `ได้ ${cash.totalExpensesForPeriod}`);
check(cash.netProfit === 7100, "กำไร = 1500+6000-400", `ได้ ${cash.netProfit}`);
check(cash.serviceRevenueForPeriod === cash.cashRevenueForPeriod, "เกณฑ์เงินเข้าใช้ยอด cash", "เกณฑ์เงินเข้าใช้ยอดตามบิล");

console.log("\n[dashboard-books] ตามบิลและเดือนถัดไป");
const billed = planDashboardBooks({ ...monthInput, sales, opex, payments, revenueBasis: "accrual" });
check(billed.serviceRevenueForPeriod === 3600, "ตามบิลใช้ยอดบิล", `ได้ ${billed.serviceRevenueForPeriod}`);
check(billed.netProfit === 9200, "กำไรตามบิล = 3600+6000-400", `ได้ ${billed.netProfit}`);

const sep = planDashboardBooks({
  ...monthInput,
  filterDate: "2026-09-01",
  customStartDate: "2026-09-01",
  customEndDate: "2026-09-30",
  sales,
  opex: [{ month: "09/2026", category: "ค่าดำเนินการ", key: "x", name: "ค่าน้ำ", amount: 100, pay_method: "โอน" }],
  payments,
  revenueBasis: "cash",
});
check(sep.arReceived === 2100, "เงิน 21 ส.ค. ที่โอน 1 ก.ย. นับ ก.ย.", `ได้ ${sep.arReceived}`);
check(sep.cashRevenueForPeriod === 2900, "เงินเข้า ก.ย. = 800+2100", `ได้ ${sep.cashRevenueForPeriod}`);
check(sep.outstandingForPeriod === 0, "บิล ส.ค. ที่จ่ายแล้วไม่ค้างใน ก.ย.", `ได้ ${sep.outstandingForPeriod}`);

const omitted = planDashboardBooks({ ...monthInput, sales, opex, payments });
check(omitted.revenueBasis === "cash", "ไม่ส่งเกณฑ์ = เงินเข้าจริง", `ได้ ${omitted.revenueBasis}`);

console.log("\n[dashboard-books] ช่วงดึงข้อมูล");
check(DASHBOARD_LOOKBACK_MONTHS === 14, "ย้อน 14 เดือน", `ได้ ${DASHBOARD_LOOKBACK_MONTHS}`);
check(dashboardLookbackStart("2026-09-19") === "2025-08-01", "เริ่ม 2025-08-01", `ได้ ${dashboardLookbackStart("2026-09-19")}`);
const opexKeys = dashboardLookbackOpexMonths("2026-09-19");
check(opexKeys.includes("08/2025") && opexKeys.includes("2025-08"), "มีเดือนเริ่มสองรูปแบบ", `ได้ ${opexKeys.slice(0, 2)}`);
check(opexKeys.includes("09/2026") && opexKeys.includes("2026-09"), "มีเดือนปัจจุบันสองรูปแบบ", "ขาดเดือนปัจจุบัน");
check(opexKeys.length === 28, "14 เดือน × 2 รูปแบบ", `ได้ ${opexKeys.length}`);

if (failures) {
  console.log(`\n[dashboard-books] ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[dashboard-books] ผ่านทั้งหมด");
}
