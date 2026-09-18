import {
  DEFAULT_TAWI50_CONDITION,
  TAWI50_CONDITIONS,
  formatTawi50Amount,
  formatTawi50IncomeLine,
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
};

export type Tawi50PayerProfile = {
  name: string;
  taxId: string;
  address: string;
  signatoryName?: string;
  signatureUrl?: string;
  stampUrl?: string;
};

function Mark({ checked }: { checked: boolean }) {
  return (
    <span
      className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center border border-slate-800 text-[10px] leading-none"
      aria-hidden
    >
      {checked ? "✓" : ""}
    </span>
  );
}

export function Tawi50Certificate({
  cert,
  payer,
  condition = DEFAULT_TAWI50_CONDITION,
  otherNote = "",
}: {
  cert: Tawi50CertificateData;
  payer: Tawi50PayerProfile;
  condition?: Tawi50ConditionId;
  otherNote?: string;
}) {
  const incomeLine = formatTawi50IncomeLine(cert.incomeTypeCode ?? "", cert.incomeType, cert.whtRate);
  const taxWords = thaiBahtText(cert.taxAmount);
  const paidDate = thaiOfficialDate(cert.paymentDate);
  const signatory = payer.signatoryName?.trim() || payer.name;

  return (
    <div className="printable-area space-y-3 border-2 border-slate-800 bg-white p-5 text-slate-950">
      <div className="flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-2">
        <div>
          <div className="text-[11px] font-semibold tracking-wide">แบบ ภ.ง.ด.50 ทวิ</div>
          <h1 className="text-base font-bold">หนังสือรับรองการหักภาษี ณ ที่จ่าย</h1>
          <div className="text-[11px]">ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</div>
        </div>
        <div className="text-right text-[11px]">
          <div>
            เล่มที่ / เลขที่{" "}
            <span className="font-mono font-semibold">{cert.certificateNumber}</span>
          </div>
          <div>วันที่จ่าย {paidDate}</div>
        </div>
      </div>

      <section className="border border-slate-800 p-2.5 text-[11px] space-y-0.5">
        <div className="font-semibold">1. ผู้มีหน้าที่หักภาษี ณ ที่จ่าย</div>
        <div className="text-sm font-semibold">{payer.name}</div>
        <div className="flex flex-wrap justify-between gap-x-4">
          <span>
            เลขประจำตัวผู้เสียภาษีอากร{" "}
            <span className="font-mono font-semibold">{payer.taxId || "-"}</span>
          </span>
          <span>สาขาที่ 00000</span>
        </div>
        <div>ที่อยู่ {payer.address || "-"}</div>
      </section>

      <section className="border border-slate-800 p-2.5 text-[11px] space-y-0.5">
        <div className="font-semibold">2. ผู้ถูกหักภาษี ณ ที่จ่าย</div>
        <div className="text-sm font-semibold">{cert.payeeName}</div>
        <div className="flex flex-wrap justify-between gap-x-4">
          <span>
            เลขประจำตัวผู้เสียภาษีอากร / เลขประจำตัวประชาชน{" "}
            <span className="font-mono font-semibold">{cert.payeeTaxId || "-"}</span>
          </span>
          <span>สาขาที่ 00000</span>
        </div>
        <div>ที่อยู่ {cert.payeeAddress || "-"}</div>
      </section>

      <table className="w-full border-collapse border border-slate-800 text-[11px]">
        <thead>
          <tr className="bg-slate-50">
            <th className="border border-slate-800 p-1.5 text-left font-semibold">
              ประเภทเงินได้พึงประเมินที่จ่าย
            </th>
            <th className="border border-slate-800 p-1.5 text-center font-semibold w-28">
              วัน เดือน ปี ที่จ่าย
            </th>
            <th className="border border-slate-800 p-1.5 text-right font-semibold w-32">
              จำนวนเงินที่จ่าย
              <div className="font-normal">(บาท)</div>
            </th>
            <th className="border border-slate-800 p-1.5 text-right font-semibold w-32">
              ภาษีที่หักและนำส่ง
              <div className="font-normal">(บาท)</div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-slate-800 p-1.5 align-top">{incomeLine}</td>
            <td className="border border-slate-800 p-1.5 text-center align-top">{paidDate}</td>
            <td className="border border-slate-800 p-1.5 text-right font-mono align-top">
              {formatTawi50Amount(cert.baseAmount)}
            </td>
            <td className="border border-slate-800 p-1.5 text-right font-mono align-top">
              {formatTawi50Amount(cert.taxAmount)}
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} className="border border-slate-800 p-1.5 text-right font-semibold">
              รวมเงินภาษีที่หักและนำส่ง
            </td>
            <td className="border border-slate-800 p-1.5 text-right font-mono">
              {formatTawi50Amount(cert.baseAmount)}
            </td>
            <td className="border border-slate-800 p-1.5 text-right font-mono font-semibold">
              {formatTawi50Amount(cert.taxAmount)}
            </td>
          </tr>
        </tfoot>
      </table>

      <div className="border border-slate-800 px-2.5 py-2 text-[11px]">
        <div className="font-semibold">รวมเงินภาษีที่หักนำส่งสุทธิ (ตัวอักษร)</div>
        <div className="mt-1 text-sm font-semibold">({taxWords})</div>
      </div>

      <div className="border border-slate-800 px-2.5 py-2 text-[11px] space-y-1.5">
        <div className="font-semibold">ผู้จ่ายเงินได้ขอรับรองว่า ได้หักภาษีไว้และนำส่งแล้ว ตาม</div>
        <div className="grid gap-1 sm:grid-cols-2">
          {TAWI50_CONDITIONS.map((item) => (
            <label key={item.id} className="flex items-center gap-1.5">
              <Mark checked={condition === item.id} />
              <span>
                {item.label}
                {item.id === "4" && condition === "4" && otherNote ? ` ${otherNote}` : ""}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 pt-2 text-[11px]">
        <div className="relative min-h-28 border border-slate-800 p-2 text-center">
          {payer.stampUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL จาก /settings ใช้พิมพ์เอกสาร A4; next/image ต้องประกาศ remotePatterns และแทรก wrapper ที่กวนหน้ากระดาษ
            <img
              src={payer.stampUrl}
              alt=""
              className="pointer-events-none absolute left-2 top-6 h-20 w-20 object-contain opacity-90"
            />
          ) : null}
          <div>ลงชื่อ ผู้มีหน้าที่หักภาษี ณ ที่จ่าย</div>
          <div className="mt-1 flex h-14 items-end justify-center">
            {payer.signatureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- ลายเซ็นดิจิทัลจาก /settings ประทับอัตโนมัติตอนพิมพ์ 50 ทวิ
              <img src={payer.signatureUrl} alt="" className="h-12 max-w-[180px] object-contain" />
            ) : (
              <div className="w-40 border-b border-slate-800" />
            )}
          </div>
          <div className="mt-1">({signatory})</div>
          <div>วันที่ {paidDate}</div>
          <div className="mt-1 text-[10px]">ประทับตราบริษัท</div>
        </div>
        <div className="min-h-28 border border-slate-800 p-2 text-center">
          <div>ลงชื่อ ผู้ถูกหักภาษี ณ ที่จ่าย</div>
          <div className="mt-1 flex h-14 items-end justify-center">
            <div className="w-40 border-b border-slate-800" />
          </div>
          <div className="mt-1">({cert.payeeName})</div>
          <div>วันที่ ........................</div>
        </div>
      </div>
    </div>
  );
}
