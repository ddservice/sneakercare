/** บันทึกสถานะเตรียม/ยื่น ภ.พ.30 — ยื่นจริงอยู่นอกระบบ ห้ามสร้างช่องทางสมมติ */

export type Pp30FilingStatus = "working_paper" | "prepared" | "filed";

export type Pp30FilingRecord = {
  periodYm: string;
  status: Pp30FilingStatus;
  reviewerName: string;
  preparedAt?: string;
  filerName?: string;
  filedAt?: string;
  evidenceRef?: string;
  evidenceNote?: string;
  paper: {
    line4TaxableSales: number;
    line5OutputVat: number;
    line6PurchaseBase: number;
    line7InputVat: number;
    line11NetPayable: number;
    line12NetExcess: number;
  };
};

function isYm(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(String(value || "").trim());
}

export function planPreparePp30(input: {
  periodYm: string;
  reviewerName: string;
  preparedAt: string;
  paper: Pp30FilingRecord["paper"];
}): { ok: true; record: Pp30FilingRecord } | { ok: false; error: string } {
  if (!isYm(input.periodYm)) return { ok: false, error: "ระบุเดือนภาษีเป็น YYYY-MM" };
  const reviewerName = String(input.reviewerName || "").trim();
  if (!reviewerName) return { ok: false, error: "ระบุผู้ตรวจสอบก่อนตั้งว่าเตรียมข้อมูลแล้ว" };
  return {
    ok: true,
    record: {
      periodYm: input.periodYm,
      status: "prepared",
      reviewerName,
      preparedAt: input.preparedAt,
      paper: input.paper,
    },
  };
}

export function planMarkPp30Filed(input: {
  current: Pp30FilingRecord;
  filerName: string;
  filedAt: string;
  evidenceRef: string;
  evidenceNote?: string;
  userConfirmedExternalFiling: boolean;
}): { ok: true; record: Pp30FilingRecord } | { ok: false; error: string } {
  if (input.current.status !== "prepared") {
    return { ok: false, error: "ต้องเตรียมข้อมูลแล้วก่อนบันทึกว่ายื่นแล้ว" };
  }
  if (!input.userConfirmedExternalFiling) {
    return { ok: false, error: "ต้องยืนยันว่ายื่นที่เว็บสรรพากรแล้ว ไม่ใช่ยื่นจากแอปนี้" };
  }
  const filerName = String(input.filerName || "").trim();
  if (!filerName) return { ok: false, error: "ระบุผู้ยื่น" };
  const evidenceRef = String(input.evidenceRef || "").trim();
  if (!evidenceRef) return { ok: false, error: "แนบเลขที่รับ/หลักฐานการยื่นจริง" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.filedAt || "").trim())) {
    return { ok: false, error: "ระบุวันที่ยื่นเป็น YYYY-MM-DD" };
  }
  return {
    ok: true,
    record: {
      ...input.current,
      status: "filed",
      filerName,
      filedAt: input.filedAt,
      evidenceRef,
      evidenceNote: String(input.evidenceNote || "").trim(),
    },
  };
}

export function isPreparedNotFiled(record: Pp30FilingRecord | null | undefined): boolean {
  return record?.status === "prepared";
}

export function isFiledWithEvidence(record: Pp30FilingRecord | null | undefined): boolean {
  return record?.status === "filed" && Boolean(record.evidenceRef);
}
