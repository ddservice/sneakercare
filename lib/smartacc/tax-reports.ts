/**
 * Revenue Department (RD) Official e-Filing Pipe-Delimited Exporters
 * Standards: ภ.พ.30 (PP.30), ภ.ง.ด.3 (PND3), ภ.ง.ด.53 (PND53) & 50 Tawi
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

/**
 * Generates Pipe-delimited text for PND3 / PND53 e-Filing
 * Format: Sequence|TaxID|Branch|Name|Address|Date|IncomeType|Rate|BaseAmount|TaxAmount|Condition
 */
// หมายเหตุ: ตัวเนื้อไฟล์ของ ภ.ง.ด.3 กับ ภ.ง.ด.53 ใช้รูปแบบ pipe-delimited ชุดเดียวกัน
// ต่างกันที่ "ยื่นในแบบไหน" ไม่ใช่ที่เนื้อไฟล์ — รับ formType ไว้เพื่อให้ผู้เรียกระบุเจตนาชัดเจน
// และเผื่อกรมสรรพากรแยกรูปแบบในอนาคต (ถ้าจะแยกจริง ให้แก้ที่นี่ที่เดียว)
export function generatePndEFilingText(records: WhtRecord[], _formType: "PND3" | "PND53"): string {
  const lines = records.map((r) => {
    const d = new Date(r.date);
    const thaiYear = d.getFullYear() + 543;
    const formattedDate = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${thaiYear}`;

    return [
      r.sequence,
      r.taxId.replace(/[^0-9]/g, ""),
      "00000",
      r.name.trim(),
      r.address.trim(),
      formattedDate,
      r.incomeType,
      r.whtRate.toFixed(2),
      r.baseAmount.toFixed(2),
      r.taxAmount.toFixed(2),
      "1", // 1 = หัก ณ ที่จ่าย
    ].join("|");
  });

  return lines.join("\r\n");
}

/**
 * Generates Pipe-delimited text for PP.30 Sales / Purchase Tax Report
 */
export function generatePp30VatText(records: VatTransaction[]): string {
  const lines = records.map((r) => {
    const d = new Date(r.invoiceDate);
    const thaiYear = d.getFullYear() + 543;
    const formattedDate = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${thaiYear}`;

    return [
      r.sequence,
      formattedDate,
      r.invoiceNo,
      r.partnerName.trim(),
      r.partnerTaxId.replace(/[^0-9]/g, ""),
      r.partnerBranch || "00000",
      r.baseAmount.toFixed(2),
      r.vatAmount.toFixed(2),
    ].join("|");
  });

  return lines.join("\r\n");
}
