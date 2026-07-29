import type { DeductItem } from './queries/payroll';
import type { BizSettings } from './queries/settings';

/** ทุกค่าที่มาจากผู้ใช้ (ชื่อพนักงาน, ธนาคาร, รายละเอียดรายการหัก, ข้อมูลร้าน ฯลฯ) ต้อง escape ก่อนเสมอ
 *  ก่อนเอาไปต่อเป็น HTML string แล้วยิงเข้า document.write — ไฟล์นี้ไม่ใช่ JSX จึงไม่มี auto-escape ของ
 *  React ช่วยป้องกันให้ (เจอเป็นช่องโหว่ XSS จริงจากการตรวจสอบความปลอดภัย 2026-07-29 — Co-Admin แก้ไข
 *  ช่องธนาคาร/รายละเอียดรายการหัก/URL โลโก้ ที่ตัวเองมีสิทธิ์แก้ไขได้อยู่แล้ว ฝังสคริปต์ได้ แล้วรอให้ Admin
 *  กดพิมพ์สลิปพนักงานคนนั้นเพื่อขโมย session — เพราะ window.open('','_blank')+document.write สืบทอด
 *  origin เดียวกับแอป ทำให้สคริปต์ที่ฝังไว้เข้าถึง localStorage/token ของแอปได้ตรงๆ) */
export function escapeHtml(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function imgToBase64(url: string): Promise<string> {
  return new Promise((resolve) => {
    if (!url) { resolve(''); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d')!.drawImage(img, 0, 0);
        resolve(c.toDataURL('image/png'));
      } catch {
        // แคนวาสถูก taint (รูปมาจากโฮสต์ที่ไม่เปิด CORS) — ห้าม fallback ไปใช้ URL ดิบเด็ดขาด เพราะเป็น
        // ค่าที่ผู้ใช้กรอกเองได้ (biz.logo_url) ถ้าเอาไปแทรกใน HTML ตรงๆ จะแหก attribute ได้ (XSS)
        resolve('');
      }
    };
    // โหลดรูปไม่สำเร็จ — ไม่แสดงโลโก้ดีกว่าเสี่ยงฉีด HTML ผ่าน URL ที่ควบคุมได้
    img.onerror = () => resolve('');
    img.src = url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now();
  });
}

export interface PayslipInput {
  employeeName: string;
  bank: string;
  account: string;
  monthKey: string; // MM/YYYY
  baseSal: number;
  comm: number;
  commPct: number;
  diligence: number;
  ot: number;
  sso: number;
  wht: number;
  deductItems: DeductItem[];
  net: number;
  biz: BizSettings;
  payerName: string;
}

export async function printPayslip(input: PayslipInput) {
  const { employeeName, bank, account, monthKey, baseSal, comm, commPct, diligence, ot, sso, wht, deductItems, net, biz, payerName } = input;
  // logoSrc มาจาก imgToBase64 เท่านั้น (data: URI ที่สร้างจากแคนวาส หรือสตริงว่าง) ไม่มีทางเป็น URL ดิบที่
  // ผู้ใช้ควบคุมได้อีกต่อไปหลังแก้ไข — แต่ escape ไว้เผื่อกันไว้อีกชั้นเพราะเป็น attribute value
  const logoSrc = biz.logo_url ? await imgToBase64(biz.logo_url) : '';

  const name = escapeHtml(employeeName);
  const dateStr = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  const f = (v: number) => v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [mm, y] = monthKey.split('/');
  const docNo = escapeHtml(`PAY-${employeeName.substring(0, 3).toUpperCase()}-${mm}-${y}`);
  const gross = baseSal + comm + diligence + ot;

  const deductRowsHtml = deductItems.map((it, i) => {
    const type = escapeHtml(it.type);
    const detail = escapeHtml(it.detail);
    const label = it.type === 'มาสาย' && it.minutes > 0
      ? `ค่ามาสาย — ${detail} (${it.minutes} นาที × ${it.rate} ฿/นาที)`
      : `${type}${detail ? ' — ' + detail : ''}`;
    return `<tr class="tr-deduct"><td style="color:#888">${i + 2}</td><td>${label}</td><td class="td-num">( ${f(it.amount)} )</td></tr>`;
  }).join('');

  const bizName = escapeHtml(biz.name);
  const bizAddress = escapeHtml(biz.address);
  const bizPhone = escapeHtml(biz.phone);
  const bizTaxId = escapeHtml(biz.tax_id);
  const bankEsc = escapeHtml(bank);
  const accountEsc = escapeHtml(account);
  const payerNameEsc = escapeHtml(payerName);
  const monthKeyEsc = escapeHtml(monthKey);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>ใบจ่ายค่าจ้างพนักงาน — ${name}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap');
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Sarabun',sans-serif;font-size:13.5px;color:#0f172a;background:#fff;padding:30px;max-width:680px;margin:0 auto;line-height:1.5}
    .doc-header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:14px;border-bottom:3px solid #0d9488;margin-bottom:16px}
    .company-block{display:flex;align-items:flex-start;gap:14px}
    .bname{font-size:16px;font-weight:700;color:#0d9488;margin-bottom:3px}
    .bsub{font-size:11px;color:#64748b;line-height:1.7}
    .doc-meta{text-align:right;font-size:11.5px;color:#444;min-width:160px}
    .doc-meta strong{display:block;font-size:13px;color:#0d9488;font-weight:700}
    .doc-title{background:#0d9488;color:#fff;text-align:center;padding:9px 0;font-size:15px;font-weight:700;letter-spacing:1px;margin-bottom:16px;border-radius:6px}
    .info-section{border:1px solid #e2e8f0;border-radius:8px;margin-bottom:14px;overflow:hidden}
    .info-section-title{background:#f1f5f9;font-size:11.5px;font-weight:700;color:#0f172a;padding:5px 12px;border-bottom:1px solid #e2e8f0}
    .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:0}
    .info-cell{padding:7px 12px;border-bottom:1px solid #e2e8f0;border-right:1px solid #e2e8f0}
    .info-cell:nth-child(even){border-right:none}
    .info-cell:nth-last-child(-n+2){border-bottom:none}
    .info-label{font-size:10px;color:#888;margin-bottom:1px}
    .info-value{font-size:13px;font-weight:600}
    table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:13px}
    .tbl-head td,th{background:#f1f5f9;font-weight:700;color:#0f172a;padding:8px 12px;border:1px solid #e2e8f0;font-size:12px}
    td{padding:7px 12px;border:1px solid #e2e8f0}
    .td-num{text-align:right}
    .tr-subtotal td{background:#f8fafc;font-weight:700}
    .tr-deduct td{color:#ef4444;background:#fef2f2}
    .tr-net td{background:#0d9488;color:#fff;font-weight:700;font-size:14px;padding:10px 12px}
    .bank-block{border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:20px}
    .footer-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-top:24px}
    .sign-box{text-align:center;padding-top:40px;border-top:1px solid #94a3b8}
    .stamp-box{text-align:center;padding-top:16px;border-top:1px dashed #94a3b8;min-height:64px}
    .sign-label{font-size:11px;color:#64748b}
    .disclaimer{margin-top:24px;padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;font-size:10px;color:#64748b;text-align:center}
    .print-toolbar{position:sticky;top:0;z-index:10;display:flex;gap:10px;justify-content:flex-end;
      padding:10px 0;margin:-30px -30px 20px;padding:14px 30px;background:#f8fafc;border-bottom:1px solid #e2e8f0}
    .print-toolbar button{font-family:'Sarabun',sans-serif;font-size:13px;font-weight:600;padding:8px 18px;
      border-radius:8px;border:none;cursor:pointer}
    .print-toolbar .btn-print{background:#0d9488;color:#fff}
    .print-toolbar .btn-close{background:#e2e8f0;color:#334155}
    @media print{body{padding:0}.print-toolbar{display:none}}
  </style>
</head>
<body>
<div class="print-toolbar">
  <button class="btn-close" onclick="window.close()">ปิดหน้าต่าง</button>
  <button class="btn-print" onclick="window.print()">🖨️ พิมพ์เอกสาร</button>
</div>
<div class="doc-header">
  <div class="company-block">
    ${logoSrc ? `<img src="${escapeHtml(logoSrc)}" style="height:84px; object-fit:contain; border-radius:6px; flex-shrink:0; margin-right:8px">` : ''}
    <div>
      <div class="bname">${bizName}</div>
      ${bizAddress ? `<div class="bsub">${bizAddress}</div>` : ''}
      ${bizPhone ? `<div class="bsub">โทรศัพท์: ${bizPhone}</div>` : ''}
      ${bizTaxId ? `<div class="bsub">เลขประจำตัวผู้เสียภาษี: ${bizTaxId}</div>` : ''}
    </div>
  </div>
  <div class="doc-meta">
    <strong>เลขที่เอกสาร</strong>${docNo}<br>
    <span style="margin-top:6px;display:block"><strong>วันที่ออกเอกสาร</strong>${dateStr}</span>
  </div>
</div>

<div class="doc-title">หนังสือรับรองการจ่ายเงินเดือนพนักงาน / PAY SLIP</div>

<div class="info-section">
  <div class="info-section-title">ข้อมูลพนักงาน (Employee Information)</div>
  <div class="info-grid">
    <div class="info-cell"><div class="info-label">ชื่อ-นามสกุลพนักงาน</div><div class="info-value">${name}</div></div>
    <div class="info-cell"><div class="info-label">ประจำรอบเดือน</div><div class="info-value">${monthKeyEsc}</div></div>
  </div>
</div>

<table>
  <tr class="tbl-head"><td colspan="2">รายการรายรับ (Earnings)</td><td class="td-num" style="width:140px">จำนวนเงิน (บาท)</td></tr>
  <tr><td style="color:#888">1</td><td>เงินเดือน (Base Salary)</td><td class="td-num">${f(baseSal)}</td></tr>
  ${comm ? `<tr><td style="color:#888">2</td><td>ค่าคอมมิชชัน (Commission ${commPct}% จากยอดขาย)</td><td class="td-num">${f(comm)}</td></tr>` : ''}
  ${diligence ? `<tr><td style="color:#888">3</td><td>ค่าเบี้ยขยัน (Diligence Bonus)</td><td class="td-num">${f(diligence)}</td></tr>` : ''}
  ${ot ? `<tr><td style="color:#888">4</td><td>ค่าล่วงเวลา / โอที (Overtime Pay)</td><td class="td-num">${f(ot)}</td></tr>` : ''}
  <tr class="tr-subtotal"><td colspan="2">รวมรายรับก่อนหัก (Gross Earnings)</td><td class="td-num">${f(gross)}</td></tr>

  <tr class="tbl-head"><td colspan="2">รายการหักเงิน (Deductions)</td><td></td></tr>
  <tr class="tr-deduct"><td style="color:#888">1</td><td>ประกันสังคมหัก ณ ที่จ่ายพนักงาน 5% (Social Security)</td><td class="td-num">( ${f(sso)} )</td></tr>
  ${wht > 0 ? `<tr class="tr-deduct"><td style="color:#888">2</td><td>ภาษีหัก ณ ที่จ่าย 3% — ค่าคอมมิชชัน (WHT 3% on Commission)</td><td class="td-num">( ${f(wht)} )</td></tr>` : ''}
  ${deductRowsHtml}

  <tr class="tr-net"><td colspan="2">ยอดเงินโอนสุทธิ (Net Payment Transfer)</td><td class="td-num">${f(net)}</td></tr>
</table>

${bank ? `
<div class="bank-block">
  <div class="info-section-title" style="background:#eff6ff; color:#1e40af">รายละเอียดการชำระเงินโอนบัญชี</div>
  <div style="display:flex; padding:8px 12px; font-size:12px; gap:20px">
    <div>ธนาคาร: <strong>${bankEsc}</strong></div>
    <div>เลขบัญชี: <strong>${accountEsc}</strong></div>
  </div>
</div>` : ''}

<div class="footer-grid">
  <div><div class="stamp-box"><div class="sign-label">ตราประทับ (ถ้ามี)</div></div></div>
  <div><div class="sign-box"><div class="sign-label">ลงลายมือชื่อผู้จ่ายเงิน</div><div style="font-weight:600; margin-top:8px">${payerNameEsc}</div></div></div>
  <div><div class="sign-box"><div class="sign-label">ลงลายมือชื่อผู้รับเงิน</div><div style="font-weight:600; margin-top:8px">${name}</div></div></div>
</div>

<div class="disclaimer">เอกสารฉบับนี้จัดทำขึ้นโดยคอมพิวเตอร์ผ่านแอปพลิเคชันระบบบริหารจัดการคลังและยอดขายร้านค้า</div>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=700,height=900');
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}
