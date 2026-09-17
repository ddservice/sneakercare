/**
 * ไฟล์ยื่น ภ.ง.ด.3 / ภ.ง.ด.53 ตาม FORMAT กลาง กรมสรรพากร Version 2.0
 * (https://www.rd.go.th/63724.html — ใช้ยื่นที่ https://efiling.rd.go.th/)
 *
 * ข้อกำหนดที่ล็อกไว้ในเทสต์:
 * - UTF-8, คั่นฟิลด์ด้วย | ไม่มี pipe ต้น/ท้ายบรรทัด, ขึ้นบรรทัดด้วย CR/LF
 * - แถวแรก Header (H) ตามด้วย Detail (D)
 * - ตัวเลขเงินเป็น 0.00 ถ้าไม่มี, วันที่จ่ายเป็น ววดดปปปป (พ.ศ.) 8 หลัก
 * - ชื่อไฟล์ TAX_TYPE_NID_BRANCH_YEAR_MONTH_FORMTYPE_ครั้งที่.txt
 */

export type WhtRecord = {
  sequence: number;
  taxId: string;
  name: string;
  address: string;
  date: string; // YYYY-MM-DD
  incomeType: string;
  whtRate: number;
  baseAmount: number;
  taxAmount: number;
  /** นิติบุคคล (ภ.ง.ด.53) หรือบุคคลธรรมดา (ภ.ง.ด.3) */
  payeeKind?: "juristic" | "person";
};

export type VatTransaction = {
  sequence: number;
  invoiceNo: string;
  invoiceDate: string; // YYYY-MM-DD
  partnerTaxId: string;
  partnerBranch: string;
  partnerName: string;
  baseAmount: number;
  vatAmount: number;
};

export type PndFilingOptions = {
  formType: "PND3" | "PND53";
  payerTaxId: string;
  payerBranch?: string;
  payerDeptName?: string;
  /** YYYY-MM ของงวด */
  periodYm: string;
  formTypeCode?: string; // 00 = ยื่นปกติ
  sequenceNo?: string; // 00-99 ครั้งที่ส่ง
  lto?: boolean;
};

export type PndFilingResult = {
  text: string;
  filename: string;
  warnings: string[];
  recordCount: number;
};

const FORBIDDEN = /[*+/\\!$%#&@,'"]/g;

export function digitsOnly(value: string): string {
  return String(value ?? "").replace(/[^0-9]/g, "");
}

export function padBranch6(value: string | undefined | null): string {
  const d = digitsOnly(value ?? "");
  if (!d) return "000000";
  return d.slice(-6).padStart(6, "0");
}

export function rdMoney(n: number): string {
  if (!Number.isFinite(n)) return "0.00";
  return (Math.round(n * 100) / 100).toFixed(2);
}

export function rdText(value: string, max: number): string {
  return String(value ?? "")
    .replace(FORBIDDEN, "")
    .replace(/\|/g, "/")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, max);
}

/** YYYY-MM-DD → ววดดปปปป (พ.ศ.) ตามสเปกกรมสรรพากร — ไม่ใช้ Date() เพื่อกันเลื่อนวันจาก UTC */
export function rdPaidDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!m) return "00000000";
  const be = Number(m[1]) + 543;
  return `${m[3]}${m[2]}${String(be).padStart(4, "0")}`;
}

export function classifyPayeeKind(taxId: string): "juristic" | "person" {
  const d = digitsOnly(taxId);
  if (d.length === 13 && d.startsWith("0")) return "juristic";
  return "person";
}

export function extractThaiTaxId(raw: string): string {
  const hit = String(raw ?? "").match(/[0-9]{13}/);
  return hit ? hit[0] : "";
}

function splitPersonName(raw: string): { title: string; first: string; last: string } {
  const t = rdText(raw, 280);
  const titles = ["นางสาว", "เด็กชาย", "เด็กหญิง", "นาย", "นาง"];
  for (const title of titles) {
    if (t.startsWith(title)) {
      const rest = t.slice(title.length).trim();
      const [first, ...lastParts] = rest.split(/\s+/);
      return { title, first: first || rest || "-", last: lastParts.join(" ") };
    }
  }
  const [first, ...lastParts] = t.split(/\s+/);
  return { title: "-", first: first || t || "-", last: lastParts.join(" ") };
}

function splitJuristicName(raw: string): { title: string; first: string; last: string } {
  const t = rdText(raw, 280);
  const prefixes = ["ห้างหุ้นส่วนจำกัด", "ห้างหุ้นส่วนสามัญ", "บริษัท"];
  for (const p of prefixes) {
    if (t.startsWith(p)) {
      const rest = t.slice(p.length).trim();
      return { title: p, first: rest || t, last: "" };
    }
  }
  return { title: "บริษัท", first: t || "-", last: "" };
}

function joinFields(fields: Array<string | number>): string {
  return fields.map((f) => (f === null || f === undefined ? "" : String(f))).join("|");
}

function periodParts(periodYm: string): { month: string; yearBe: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(periodYm);
  if (!m) {
    const now = new Date();
    return {
      month: String(now.getMonth() + 1).padStart(2, "0"),
      yearBe: String(now.getFullYear() + 543),
    };
  }
  return { month: m[2], yearBe: String(Number(m[1]) + 543) };
}

function buildHeader(
  opts: PndFilingOptions,
  totals: { count: number; amount: number; tax: number }
): string {
  const nid = digitsOnly(opts.payerTaxId).slice(0, 13);
  const branch = padBranch6(opts.payerBranch);
  const { month, yearBe } = periodParts(opts.periodYm);
  const formTypeCode = (opts.formTypeCode ?? "00").padStart(2, "0").slice(0, 2);
  const isPnd3 = opts.formType === "PND3";
  return joinFields([
    "H",
    "0000",
    nid,
    branch,
    "1",
    opts.formType,
    nid,
    branch,
    rdText(opts.payerDeptName || "สำนักงานใหญ่", 80),
    "1", // มาตรา 3 เตรส
    isPnd3 ? "0" : "0", // PND3: มาตรา 48 ทวิ · PND53: มาตรา 65 จัตวา
    isPnd3 ? "0" : "0", // PND3: มาตรา 50 (3)(4)(5) · PND53: มาตรา 69 ทวิ
    opts.lto ? "1" : "0",
    month,
    yearBe,
    "V",
    formTypeCode,
    String(totals.count),
    rdMoney(totals.amount),
    rdMoney(totals.tax),
    "0.00",
    rdMoney(totals.tax),
    "0.00",
    "",
    "2", // ยื่นแบบอินเทอร์เน็ต (efiling.rd.go.th)
  ]);
}

function buildDetail(record: WhtRecord, formType: "PND3" | "PND53", payerBranch: string): string {
  const kind = record.payeeKind ?? classifyPayeeKind(record.taxId);
  const names =
    formType === "PND3" || kind === "person"
      ? splitPersonName(record.name)
      : splitJuristicName(record.name);
  const nid = digitsOnly(record.taxId).slice(0, 13);
  const paid = rdPaidDate(record.date);
  return joinFields([
    "D",
    String(record.sequence),
    padBranch6(payerBranch),
    nid,
    "0000000000",
    rdText(names.title, 100),
    rdText(names.first, 100),
    rdText(names.last, 80),
    paid,
    rdMoney(record.whtRate),
    rdMoney(record.baseAmount),
    rdMoney(record.taxAmount),
    rdText(record.incomeType || "ค่าบริการ", 100),
    "1",
    "00000000",
    "0.00",
    "0.00",
    "0.00",
    "",
    "",
    "00000000",
    "0.00",
    "0.00",
    "0.00",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    rdText(record.address, 100),
    "",
    "",
    "",
    "",
  ]);
}

export function pndFilename(opts: PndFilingOptions): string {
  const nid = digitsOnly(opts.payerTaxId).slice(0, 13).padStart(13, "0");
  const branch = padBranch6(opts.payerBranch);
  const { month, yearBe } = periodParts(opts.periodYm);
  const formTypeCode = (opts.formTypeCode ?? "00").padStart(2, "0").slice(0, 2);
  const seq = (opts.sequenceNo ?? "00").padStart(2, "0").slice(0, 2);
  return `${opts.formType}_${nid}_${branch}_${yearBe}_${month}_${formTypeCode}_${seq}.txt`;
}

export function generatePndEFilingFile(
  records: WhtRecord[],
  opts: PndFilingOptions
): PndFilingResult {
  const warnings: string[] = [];
  const payerNid = digitsOnly(opts.payerTaxId);
  if (payerNid.length !== 13) {
    warnings.push("เลขผู้เสียภาษีผู้มีหน้าที่หักต้องเป็น 13 หลัก (ตั้งที่ /settings) มิฉะนั้น e-Filing จะปฏิเสธไฟล์");
  }

  const numbered = records.map((r, i) => ({ ...r, sequence: i + 1 }));
  for (const r of numbered) {
    if (digitsOnly(r.taxId).length !== 13) {
      warnings.push(`รายการที่ ${r.sequence} (${r.name}) ไม่มีเลขผู้เสียภาษี 13 หลัก — e-Filing จะไม่รับ`);
    }
  }

  const totals = {
    count: numbered.length,
    amount: numbered.reduce((s, r) => s + Number(r.baseAmount || 0), 0),
    tax: numbered.reduce((s, r) => s + Number(r.taxAmount || 0), 0),
  };

  const lines = [
    buildHeader(opts, totals),
    ...numbered.map((r) => buildDetail(r, opts.formType, opts.payerBranch ?? "000000")),
  ];

  return {
    text: lines.join("\r\n"),
    filename: pndFilename(opts),
    warnings,
    recordCount: numbered.length,
  };
}

/** คงชื่อเดิมให้จุดเรียกเก่า — คืนเฉพาะเนื้อไฟล์ (มี Header+Detail ตามสเปกใหม่) */
export function generatePndEFilingText(
  records: WhtRecord[],
  formType: "PND3" | "PND53",
  opts?: Omit<PndFilingOptions, "formType">
): string {
  return generatePndEFilingFile(records, {
    formType,
    payerTaxId: opts?.payerTaxId ?? "",
    payerBranch: opts?.payerBranch,
    payerDeptName: opts?.payerDeptName,
    periodYm: opts?.periodYm ?? "2026-01",
    formTypeCode: opts?.formTypeCode,
    sequenceNo: opts?.sequenceNo,
    lto: opts?.lto,
  }).text;
}

/**
 * รายงานภาษีขายสำหรับอ้างอิง — ภ.พ.30 บน e-Filing กรอกในเว็บ ไม่ใช่ไฟล์ | แบบ ภ.ง.ด.
 */
export function generatePp30VatText(records: VatTransaction[]): string {
  const lines = records.map((r) => {
    return [
      r.sequence,
      rdPaidDate(r.invoiceDate),
      rdText(r.invoiceNo, 40),
      rdText(r.partnerName, 100),
      digitsOnly(r.partnerTaxId).slice(0, 13),
      padBranch6(r.partnerBranch),
      rdMoney(r.baseAmount),
      rdMoney(r.vatAmount),
    ].join("|");
  });
  return lines.join("\r\n");
}
