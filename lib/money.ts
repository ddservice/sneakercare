/**
 * ตัวแทนเงินกลาง — จำนวนเต็มสตางค์ (bigint) + สตริงทศนิยม 2 ตำแหน่ง
 *
 * นโยบายที่พบในโค้ดเดิม (2026-09-19) และล็อกไว้ที่นี่:
 *   • เงินบาท scale = 2 (สตางค์)
 *   • ปัดครึ่งขึ้น (HALF_UP) สำหรับจำนวน ≥ 0
 *   • VAT มาตรฐานปัจจุบัน = 7% ของฐานไม่รวม VAT — ค่าคงที่ ไม่ใช่ตาราง effective date
 *
 * ห้ามคำนวณเงินด้วย JavaScript number / parseFloat ในโมดูลใหม่
 * เส้นทางเก่ายังคืน number ผ่านตัวห่อ เพื่อไม่เปลี่ยนผลลัพธ์ที่กระทบยอดกับ Excel แล้ว
 *
 * อ่านรายละเอียดบัญชีที่ docs/money-and-tax.md
 */

export const MONEY_SCALE = 2;
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
export const SATANG_PER_BAHT = BigInt(100);
const BPS_PER_WHOLE = BigInt(100);
const BPS_DENOM = BigInt(10000);
export const STANDARD_VAT_RATE_PERCENT = "7";

const DECIMAL_RE = /^-?\d+(?:\.\d+)?$/;

export type MoneyString = string;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

function assertNonNegative(satang: bigint, label: string) {
  if (satang < ZERO) throw new MoneyError(`${label} ต้องไม่ติดลบ`);
}

/** แปลงข้อความทศนิยมเป็นสตางค์ — ปัดครึ่งขึ้นที่หลักที่ 3 ถ้ามีเกิน 2 ตำแหน่ง */
export function parseMoney(raw: string): bigint {
  const s = String(raw ?? "").trim().replace(/,/g, "");
  if (!DECIMAL_RE.test(s)) throw new MoneyError(`จำนวนเงินไม่ถูกต้อง: ${raw}`);

  const negative = s.startsWith("-");
  const unsigned = negative ? s.slice(1) : s;
  const [wholePart, fracRaw = ""] = unsigned.split(".");
  const whole = BigInt(wholePart);

  if (fracRaw.length <= MONEY_SCALE) {
    const frac = BigInt((fracRaw + "00").slice(0, MONEY_SCALE));
    const satang = whole * SATANG_PER_BAHT + frac;
    return negative ? -satang : satang;
  }

  const keep = fracRaw.slice(0, MONEY_SCALE);
  const rest = fracRaw.slice(MONEY_SCALE);
  let frac = BigInt(keep);
  const firstDiscard = Number(rest[0] ?? "0");
  if (firstDiscard >= 5) {
    frac += ONE;
  }
  let satang = whole * SATANG_PER_BAHT + frac;
  if (frac >= SATANG_PER_BAHT) {
    satang = (whole + ONE) * SATANG_PER_BAHT + (frac - SATANG_PER_BAHT);
  }
  return negative ? -satang : satang;
}

export function formatMoney(satang: bigint): MoneyString {
  const negative = satang < ZERO;
  const abs = negative ? -satang : satang;
  const whole = abs / SATANG_PER_BAHT;
  const frac = abs % SATANG_PER_BAHT;
  const body = `${whole.toString()}.${frac.toString().padStart(MONEY_SCALE, "0")}`;
  return negative ? `-${body}` : body;
}

/** รับสตริงเป็นหลัก — number รับเฉพาะตอนห่อเส้นทางเก่า (แปลงผ่าน toFixed ซึ่งมีขอบ float) */
export function moneyString(raw: string | number): MoneyString {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return "0.00";
    return formatMoney(parseMoney(raw.toFixed(MONEY_SCALE)));
  }
  return formatMoney(parseMoney(raw));
}

export function addMoney(...parts: Array<string | number>): MoneyString {
  const total = parts.reduce((sum, p) => sum + parseMoney(moneyString(p)), ZERO);
  return formatMoney(total);
}

export function subMoney(left: string | number, right: string | number): MoneyString {
  return formatMoney(parseMoney(moneyString(left)) - parseMoney(moneyString(right)));
}

/**
 * ฐาน × อัตรา% แล้วปัดเป็นสตางค์แบบ HALF_UP
 * เช่น 1000.00 × 7% = 70.00
 */
export function percentOf(base: string | number, ratePercent: string | number): MoneyString {
  const satang = parseMoney(moneyString(base));
  const bps = parsePercentToBps(ratePercent);
  return formatMoney(divHalfUp(satang * bps, BPS_DENOM));
}

/** 7 หรือ "7.00" → 700 basis points (1% = 100 bps) */
export function parsePercentToBps(ratePercent: string | number): bigint {
  const s = typeof ratePercent === "number" ? ratePercent.toFixed(MONEY_SCALE) : String(ratePercent).trim();
  if (!DECIMAL_RE.test(s)) throw new MoneyError(`อัตราไม่ถูกต้อง: ${ratePercent}`);
  const [w, f = ""] = s.split(".");
  const frac = (f + "00").slice(0, 2);
  return BigInt(w) * BPS_PER_WHOLE + BigInt(frac);
}

function divHalfUp(numer: bigint, denom: bigint): bigint {
  if (denom <= ZERO) throw new MoneyError("ตัวหารต้องเป็นบวก");
  if (numer >= ZERO) return (numer + denom / TWO) / denom;
  return -(((-numer) + denom / TWO) / denom);
}

export function vatOnExclusive(base: string | number, ratePercent: string = STANDARD_VAT_RATE_PERCENT): MoneyString {
  const baseSatang = parseMoney(moneyString(base));
  assertNonNegative(baseSatang, "ฐาน VAT");
  return percentOf(formatMoney(baseSatang), ratePercent);
}

export function settleExclusiveVat(
  base: string | number,
  ratePercent: string = STANDARD_VAT_RATE_PERCENT
): { subtotal: MoneyString; vatRate: MoneyString; vatAmount: MoneyString; grandTotal: MoneyString } {
  const subtotal = moneyString(base);
  const rate = moneyString(ratePercent);
  const vatAmount = rate === "0.00" ? "0.00" : vatOnExclusive(subtotal, ratePercent);
  return {
    subtotal,
    vatRate: rate,
    vatAmount,
    grandTotal: addMoney(subtotal, vatAmount),
  };
}

/** ราคารวม VAT → แยกฐานและ VAT (ฐาน = รวม × 100 / (100+อัตรา) ปัด HALF_UP) */
export function settleInclusiveVat(
  gross: string | number,
  ratePercent: string = STANDARD_VAT_RATE_PERCENT
): { subtotal: MoneyString; vatRate: MoneyString; vatAmount: MoneyString; grandTotal: MoneyString } {
  const grandTotal = moneyString(gross);
  const grandSatang = parseMoney(grandTotal);
  assertNonNegative(grandSatang, "ยอดรวม VAT");
  const bps = parsePercentToBps(ratePercent);
  if (bps === ZERO) {
    return { subtotal: grandTotal, vatRate: "0.00", vatAmount: "0.00", grandTotal };
  }
  const subtotalSatang = divHalfUp(grandSatang * BPS_DENOM, BPS_DENOM + bps);
  const vatSatang = grandSatang - subtotalSatang;
  return {
    subtotal: formatMoney(subtotalSatang),
    vatRate: moneyString(ratePercent),
    vatAmount: formatMoney(vatSatang),
    grandTotal,
  };
}

/** ห่อเส้นทางเก่า — ผลลัพธ์เป็น number เพื่อไม่ต้องแก้ทุก caller ในระยะนี้ */
export function moneyNumber(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Number(moneyString(n));
}
