import {
  DEFAULT_TAWI50_CONDITION,
  TAWI50_CONDITIONS,
  TAWI50_FORM_ROWS,
  formatTawi50Amount,
  inferIncomeTypeCode,
  tawi50FormRowId,
  tawi50RowSpecify,
  thaiOfficialDate,
  type Tawi50ConditionId,
} from "@/lib/wht";
import { thaiBahtText } from "@/lib/bahttext";

export type Tawi50CertificateData = {
  certificateNumber: string;
  paymentDate: string;
  incomeType: string;
  incomeTypeCode?: string | null;
  baseAmount: number;
  taxAmount: number;
  whtRate: number;
  payeeName: string;
  payeeTaxId: string;
  payeeAddress: string;
  payeeKind?: "person" | "juristic";
};

export type Tawi50PayerProfile = {
  name: string;
  taxId: string;
  address: string;
  signatoryName?: string;
  signatureUrl?: string;
  stampUrl?: string;
};

function digitsOnly(value: string): string {
  return String(value ?? "").replace(/[^0-9]/g, "");
}

function DigitBoxes({
  value,
  count,
  splitFirst = false,
}: {
  value: string;
  count: number;
  splitFirst?: boolean;
}) {
  const chars = digitsOnly(value).slice(0, count).padEnd(count, " ").split("");
  return (
    <span className="inline-flex items-stretch align-middle">
      {chars.map((ch, i) => (
        <span
          key={i}
          className={`inline-flex h-[18px] w-[14px] items-center justify-center border border-black text-[11px] font-mono leading-none ${
            i === 0 ? "" : "border-l-0"
          } ${splitFirst && i === 0 ? "mr-[3px] border-l border-black w-[16px]" : ""} ${
            splitFirst && i === 1 ? "border-l" : ""
          }`}
        >
          {ch.trim()}
        </span>
      ))}
    </span>
  );
}

function Tick({ checked }: { checked: boolean }) {
  return (
    <span className="inline-flex h-[12px] w-[12px] shrink-0 items-center justify-center border border-black text-[10px] leading-none">
      {checked ? "/" : ""}
    </span>
  );
}

function RdSeal() {
  return (
    <svg viewBox="0 0 72 72" className="h-[68px] w-[68px] shrink-0" aria-hidden>
      <circle cx="36" cy="36" r="34" fill="none" stroke="#111" strokeWidth="1.6" />
      <circle cx="36" cy="36" r="28" fill="none" stroke="#111" strokeWidth="0.8" />
      <text x="36" y="32" textAnchor="middle" fontSize="8" fill="#111" fontFamily="serif">
        กรมสรรพากร
      </text>
      <text x="36" y="44" textAnchor="middle" fontSize="7" fill="#111" fontFamily="serif">
        RD
      </text>
    </svg>
  );
}

export function Tawi50Certificate({
  cert,
  payer,
  condition = DEFAULT_TAWI50_CONDITION,
  otherNote = "",
  copyNo = 1,
}: {
  cert: Tawi50CertificateData;
  payer: Tawi50PayerProfile;
  condition?: Tawi50ConditionId;
  otherNote?: string;
  copyNo?: 1 | 2;
}) {
  const incomeCode = inferIncomeTypeCode(cert.incomeType, cert.incomeTypeCode);
  const filledRow = tawi50FormRowId(incomeCode);
  const specify = tawi50RowSpecify(incomeCode, cert.incomeType);
  const taxWords = thaiBahtText(cert.taxAmount);
  const paidDate = thaiOfficialDate(cert.paymentDate);
  const signatory = payer.signatoryName?.trim() || payer.name;
  const payerTax = digitsOnly(payer.taxId);
  const payeeTax = digitsOnly(cert.payeeTaxId);
  const isPerson = cert.payeeKind === "person";
  const copyCaption =
    copyNo === 2
      ? "ฉบับที่ 2 (สำหรับผู้มีหน้าที่หักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)"
      : "ฉบับที่ 1 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)";

  return (
    <div className="printable-area bg-white p-3 text-black">
      <div className="border border-black px-3 py-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <RdSeal />
            <div className="pt-1 text-[11px] leading-snug">
              <div>{copyCaption}</div>
            </div>
          </div>
          <div className="w-[168px] border border-black text-[11px]">
            <div className="border-b border-black px-2 py-1">
              ที่ <span className="font-mono">{cert.certificateNumber}</span>
            </div>
            <div className="px-2 py-1 font-semibold">แบบ ภ.ง.ด.50 ทวิ</div>
          </div>
        </div>

        <div className="mt-1 text-center">
          <div className="text-[16px] font-bold leading-tight">หนังสือรับรองการหักภาษี ณ ที่จ่าย</div>
          <div className="text-[12px]">ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</div>
        </div>

        <div className="mt-3 text-[11px] leading-relaxed">
          <div className="font-semibold">ผู้มีหน้าที่หักภาษี ณ ที่จ่าย :</div>
          <div className="pl-4">
            <div>
              ชื่อ <span className="font-semibold">{payer.name}</span>
            </div>
            <div>ที่อยู่ {payer.address || "-"}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1">
                เลขประจำตัวผู้เสียภาษีอากร <DigitBoxes value={payerTax} count={13} splitFirst />
              </span>
              <span className="inline-flex items-center gap-1">
                สาขาที่ <DigitBoxes value="00000" count={5} />
              </span>
            </div>
          </div>
        </div>

        <div className="mt-3 text-[11px] leading-relaxed">
          <div className="font-semibold">ผู้ถูกหักภาษี ณ ที่จ่าย :</div>
          <div className="pl-4">
            <div>
              ชื่อ <span className="font-semibold">{cert.payeeName}</span>
            </div>
            <div>ที่อยู่ {cert.payeeAddress || "-"}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1">
                เลขประจำตัวผู้เสียภาษีอากร{" "}
                <DigitBoxes value={isPerson ? "" : payeeTax} count={13} splitFirst />
              </span>
              <span className="inline-flex items-center gap-1">
                สาขาที่ <DigitBoxes value={isPerson ? "" : "00000"} count={5} />
              </span>
            </div>
            <div className="mt-1 inline-flex items-center gap-1">
              เลขประจำตัวประชาชน <DigitBoxes value={isPerson ? payeeTax : ""} count={13} />
            </div>
          </div>
        </div>

        <table className="mt-3 w-full border-collapse text-[10px] leading-tight">
          <thead>
            <tr>
              <th className="w-10 border border-black bg-neutral-200 px-1 py-1 font-semibold">ลำดับที่</th>
              <th className="border border-black bg-neutral-200 px-1 py-1 text-left font-semibold">
                ประเภทเงินได้พึงประเมินที่จ่าย
              </th>
              <th className="w-[88px] border border-black bg-neutral-200 px-1 py-1 font-semibold">
                วัน เดือน หรือปีภาษีที่จ่าย
              </th>
              <th className="w-[92px] border border-black bg-neutral-200 px-1 py-1 font-semibold">
                จำนวนเงินที่จ่าย
              </th>
              <th className="w-[92px] border border-black bg-neutral-200 px-1 py-1 font-semibold">
                ภาษีที่หักและนำส่ง
              </th>
            </tr>
          </thead>
          <tbody>
            {TAWI50_FORM_ROWS.map((row) => {
              const active = row.id === filledRow;
              const extra =
                active && row.id === "5" && specify
                  ? ` (${specify})`
                  : active && row.id === "6" && specify
                    ? ` ${specify}`
                    : "";
              return (
                <tr key={row.id}>
                  <td className="border border-black px-1 py-1 text-center align-top">{row.no}</td>
                  <td className="border border-black px-1 py-1 align-top whitespace-pre-line">
                    {row.label}
                    {extra}
                  </td>
                  <td className="border border-black px-1 py-1 text-center align-top">
                    {active ? paidDate : ""}
                  </td>
                  <td className="border border-black px-1 py-1 text-right font-mono align-top">
                    {active ? formatTawi50Amount(cert.baseAmount) : ""}
                  </td>
                  <td className="border border-black px-1 py-1 text-right font-mono align-top">
                    {active ? formatTawi50Amount(cert.taxAmount) : ""}
                  </td>
                </tr>
              );
            })}
            <tr>
              <td colSpan={3} className="border border-black px-1 py-1 text-center font-semibold">
                รวม
              </td>
              <td className="border border-black px-1 py-1 text-right font-mono">
                {formatTawi50Amount(cert.baseAmount)}
              </td>
              <td className="border border-black px-1 py-1 text-right font-mono">
                {formatTawi50Amount(cert.taxAmount)}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="mt-2 flex items-stretch text-[11px]">
          <div className="flex items-center border border-black px-2 py-1 font-semibold">
            รวมเงินภาษีที่หักและนำส่ง (ตัวอักษร)
          </div>
          <div className="flex-1 border border-l-0 border-black px-2 py-1">
            ({taxWords})
          </div>
        </div>

        <div className="mt-3 text-[11px] leading-relaxed">
          <div>
            ผู้มีหน้าที่หักภาษี ณ ที่จ่ายขอรับรองว่า ได้หักและนำส่งภาษีตามจำนวนข้างต้นไว้ถูกต้องแล้ว
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
            {TAWI50_CONDITIONS.map((item) => (
              <span key={item.id} className="inline-flex items-center gap-1">
                <Tick checked={condition === item.id} />
                {item.label}
                {item.id === "4" ? (
                  <span className="inline-block min-w-[120px] border-b border-black px-1">
                    {condition === "4" ? otherNote : ""}
                  </span>
                ) : null}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-6 text-[11px]">
          <div className="relative min-h-[92px] text-center">
            {payer.signatureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- ลายเซ็นจาก /settings ประทับบนแบบ 50 ทวิ
              <img
                src={payer.signatureUrl}
                alt=""
                className="mx-auto mb-1 h-10 max-w-[180px] object-contain"
              />
            ) : (
              <div className="mx-auto mb-1 h-10 w-44 border-b border-black" />
            )}
            <div>ลงชื่อ .............................................. ผู้มีหน้าที่หักภาษี ณ ที่จ่าย</div>
            <div className="mt-1">({signatory})</div>
            <div className="mt-1">วัน เดือน ปี {paidDate}</div>
          </div>
          <div className="relative min-h-[92px] text-center">
            {payer.stampUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- ตราประทับนิติบุคคลจาก /settings
              <img
                src={payer.stampUrl}
                alt=""
                className="mx-auto h-[72px] w-[72px] object-contain"
              />
            ) : (
              <div className="mx-auto h-[72px] w-[72px] rounded-full border border-dashed border-black/40" />
            )}
            <div className="mt-1">ประทับตรา นิติบุคคล (ถ้ามี)</div>
          </div>
        </div>

        <div className="mt-3 text-[9px] leading-snug">
          คำเตือน ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย หากฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ
          แห่งประมวลรัษฎากร ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร
        </div>
      </div>
    </div>
  );
}
