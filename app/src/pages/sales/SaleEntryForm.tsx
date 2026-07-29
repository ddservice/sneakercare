import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { useSaveSale, useSales } from '../../lib/queries/sales';
import { useBizSettings } from '../../lib/queries/settings';
import { loadExtraServicesCatalog, rememberExtraService, type ExtraServiceCatalogEntry } from '../../lib/extraServicesCatalog';
import { fc, todayIso } from '../../lib/format';

interface ExtraLine { name: string; price: number }

interface SaleDraft {
  qty: { s: number; m: number; l: number; xl: number };
  disc: { s: number; m: number; l: number; xl: number };
  extraLines: ExtraLine[];
  transferAmount: number;
  cashAmount: number;
  paymentStatus: 'ชำระครบ' | 'ชำระบางส่วน' | 'ค้างชำระ';
  receivedAmount: number;
}

const draftKey = (date: string) => `sale_draft_${date}`;
const isEmptyDraft = (d: SaleDraft) =>
  d.qty.s === 0 && d.qty.m === 0 && d.qty.l === 0 && d.qty.xl === 0 &&
  d.extraLines.length === 0 && d.transferAmount === 0 && d.cashAmount === 0 && d.receivedAmount === 0;

export default function SaleEntryForm() {
  const { auth } = useAuth();
  const [date, setDate] = useState(todayIso());
  const { data: existingSales } = useSales(date, date);
  const { data: biz } = useBizSettings();
  const save = useSaveSale();
  const DEFAULT_PRICE = { s: biz?.price_s ?? 200, m: biz?.price_m ?? 400, l: biz?.price_l ?? 600, xl: biz?.price_xl ?? 800 };

  const [qty, setQty] = useState({ s: 0, m: 0, l: 0, xl: 0 });
  const [disc, setDisc] = useState({ s: 0, m: 0, l: 0, xl: 0 });
  const [extraLines, setExtraLines] = useState<ExtraLine[]>([]);
  const [extraName, setExtraName] = useState('');
  const [extraPrice, setExtraPrice] = useState(0);
  const [extraCatalog, setExtraCatalog] = useState<ExtraServiceCatalogEntry[]>(() => loadExtraServicesCatalog());

  const [transferAmount, setTransferAmount] = useState(0);
  const [cashAmount, setCashAmount] = useState(0);
  const [paymentStatus, setPaymentStatus] = useState<'ชำระครบ' | 'ชำระบางส่วน' | 'ค้างชำระ'>('ชำระครบ');
  const [receivedAmount, setReceivedAmount] = useState(0);

  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);

  // กู้คืนร่างที่กรอกค้างไว้ (กันข้อมูลหายถ้าเผลอรีเฟรชหน้า) — ทำครั้งเดียวตอนโหลดหน้าสำหรับวันที่ตั้งต้น
  // เท่านั้น ไม่ทำซ้ำตอนสลับวันที่มือเอง เพื่อเลี่ยง race กับ effect ที่บันทึกร่างด้านล่าง
  const hasTriedLoadRef = useRef(false);
  const skipNextSaveRef = useRef(false);

  useEffect(() => {
    if (hasTriedLoadRef.current || existingSales === undefined) return;
    hasTriedLoadRef.current = true;
    if (existingSales.length > 0) return; // มีข้อมูลจริงบันทึกไว้แล้วสำหรับวันนี้ ไม่ต้องเอาร่างเก่ามาทับ
    try {
      const raw = localStorage.getItem(draftKey(date));
      if (!raw) return;
      const d: SaleDraft = JSON.parse(raw);
      skipNextSaveRef.current = true;
      setQty(d.qty); setDisc(d.disc); setExtraLines(d.extraLines);
      setTransferAmount(d.transferAmount); setCashAmount(d.cashAmount);
      setPaymentStatus(d.paymentStatus); setReceivedAmount(d.receivedAmount);
      setStatus({ text: `กู้คืนข้อมูลที่กรอกค้างไว้ของวันที่ ${date} แล้ว`, ok: true });
      setTimeout(() => setStatus(null), 4000);
    } catch {
      // ร่างเสีย/อ่านไม่ได้ ข้ามไปเงียบๆ
    }
  }, [existingSales, date]);

  useEffect(() => {
    if (skipNextSaveRef.current) { skipNextSaveRef.current = false; return; }
    const draft: SaleDraft = { qty, disc, extraLines, transferAmount, cashAmount, paymentStatus, receivedAmount };
    if (isEmptyDraft(draft)) { localStorage.removeItem(draftKey(date)); return; }
    localStorage.setItem(draftKey(date), JSON.stringify(draft));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, qty, disc, extraLines, transferAmount, cashAmount, paymentStatus, receivedAmount]);

  const extraTotal = extraLines.reduce((s, l) => s + l.price, 0);
  const netBySize = {
    s: Math.max(qty.s * DEFAULT_PRICE.s - disc.s, 0),
    m: Math.max(qty.m * DEFAULT_PRICE.m - disc.m, 0),
    l: Math.max(qty.l * DEFAULT_PRICE.l - disc.l, 0),
    xl: Math.max(qty.xl * DEFAULT_PRICE.xl - disc.xl, 0),
  };
  const grossAmount = qty.s * DEFAULT_PRICE.s + qty.m * DEFAULT_PRICE.m + qty.l * DEFAULT_PRICE.l + qty.xl * DEFAULT_PRICE.xl + extraTotal;
  const sizeDiscountTotal = disc.s + disc.m + disc.l + disc.xl;
  const totalAmount = netBySize.s + netBySize.m + netBySize.l + netBySize.xl + extraTotal;

  const onTransferChange = (val: number) => {
    setTransferAmount(val);
    setCashAmount(Math.max(totalAmount - val, 0));
  };
  const onCashChange = (val: number) => {
    setCashAmount(val);
    setTransferAmount(Math.max(totalAmount - val, 0));
  };

  const addExtraLine = () => {
    const name = extraName.trim();
    if (!name) { setStatus({ text: 'กรุณาระบุชื่อบริการ', ok: false }); return; }
    if (extraPrice <= 0) { setStatus({ text: 'กรุณาระบุราคา', ok: false }); return; }
    setExtraLines((prev) => [...prev, { name, price: extraPrice }]);
    rememberExtraService(name, extraPrice);
    setExtraCatalog((prev) => (prev.some((s) => s.name === name) ? prev : [...prev, { name, price: extraPrice }]));
    setExtraName(''); setExtraPrice(0);
  };
  const removeExtraLine = (idx: number) => setExtraLines((prev) => prev.filter((_, i) => i !== idx));

  const onExtraNameChange = (name: string) => {
    setExtraName(name);
    const knownPrice = extraCatalog.find((s) => s.name === name.trim())?.price;
    if (knownPrice !== undefined) setExtraPrice(knownPrice);
  };

  const submit = async () => {
    const totalPairs = qty.s + qty.m + qty.l + qty.xl;
    if (totalPairs === 0 && extraTotal === 0) {
      setStatus({ text: 'กรุณากรอกจำนวนรองเท้าอย่างน้อย 1 คู่ หรือเพิ่มบริการอื่นๆ', ok: false });
      return;
    }
    if (existingSales?.length) {
      const ok = window.confirm(`พบข้อมูลยอดขายของวันที่ ${date} อยู่ในระบบแล้ว คุณต้องการยืนยันการบันทึกแก้ไขเปลี่ยนแปลงข้อมูลหรือไม่?`);
      if (!ok) return;
    }
    const received = paymentStatus === 'ชำระครบ' ? totalAmount : receivedAmount;
    setStatus({ text: 'กำลังบันทึกข้อมูล...', ok: true });
    try {
      await save.mutateAsync({
        date,
        extraItems: extraLines.length ? JSON.stringify(extraLines) : '',
        sizeS: qty.s, sizeM: qty.m, sizeL: qty.l, sizeXl: qty.xl,
        grossAmount, discount: sizeDiscountTotal, totalAmount,
        transferAmount, cashAmount, paymentStatus, receivedAmount: received,
        recordedBy: auth?.displayName || auth?.username || 'Staff',
      });
      localStorage.removeItem(draftKey(date));
      setStatus({ text: 'บันทึกยอดขายสำเร็จเรียบร้อย ✓', ok: true });
      setQty({ s: 0, m: 0, l: 0, xl: 0 });
      setDisc({ s: 0, m: 0, l: 0, xl: 0 });
      setExtraLines([]);
      setTransferAmount(0); setCashAmount(0); setPaymentStatus('ชำระครบ'); setReceivedAmount(0);
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      setStatus({ text: 'ข้อผิดพลาด: ' + (err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ'), ok: false });
    }
  };

  return (
    <div className="card">
      <h2>บันทึกยอดขายประจำวัน</h2>
      <label>
        วันที่
        <input type="date" max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        {(['s', 'm', 'l', 'xl'] as const).map((sz) => (
          <div key={sz} className="init-stock-fieldset">
            <legend>{sz.toUpperCase()} ({DEFAULT_PRICE[sz]} ฿/คู่)</legend>
            <label>
              จำนวน
              <input type="number" min={0} value={qty[sz]} onChange={(e) => setQty((q) => ({ ...q, [sz]: +e.target.value }))} />
            </label>
            <label>
              ส่วนลด (บาท)
              <input type="number" min={0} value={disc[sz]} onChange={(e) => setDisc((d) => ({ ...d, [sz]: +e.target.value }))} />
            </label>
            <p className="poc-note">= {fc(netBySize[sz])} ฿</p>
          </div>
        ))}
      </div>

      <div className="init-stock-fieldset">
        <legend>บริการอื่นๆ</legend>
        {extraLines.map((l, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
            <span>{l.name}</span>
            <span>{fc(l.price)} ฿ <button type="button" onClick={() => removeExtraLine(i)}>×</button></span>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input placeholder="ชื่อบริการ" value={extraName} onChange={(e) => onExtraNameChange(e.target.value)} style={{ flex: '2 1 140px' }} list="extra_services_datalist" />
          <input type="number" placeholder="ราคา" min={0} value={extraPrice} onChange={(e) => setExtraPrice(+e.target.value)} style={{ flex: '1 1 90px' }} />
          <button type="button" onClick={addExtraLine}>+ เพิ่ม</button>
          <datalist id="extra_services_datalist">
            {extraCatalog.map((s) => <option key={s.name} value={s.name} />)}
          </datalist>
        </div>
      </div>

      <p className="poc-note">
        ยอดก่อนลด {fc(grossAmount)} ฿ {sizeDiscountTotal > 0 && `— ลดรวม ${fc(sizeDiscountTotal)} ฿`}
      </p>
      <h3>ยอดรวมสุทธิ: {fc(totalAmount)} ฿</h3>

      <label>
        รับเงินโอน (บาท)
        <input type="number" min={0} value={transferAmount} onChange={(e) => onTransferChange(+e.target.value)} />
      </label>
      <label>
        รับเงินสด (บาท)
        <input type="number" min={0} value={cashAmount} onChange={(e) => onCashChange(+e.target.value)} />
      </label>

      <label>
        สถานะการชำระ
        <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as typeof paymentStatus)}>
          <option value="ชำระครบ">ชำระครบ</option>
          <option value="ชำระบางส่วน">ชำระบางส่วน</option>
          <option value="ค้างชำระ">ค้างชำระ</option>
        </select>
      </label>
      {paymentStatus !== 'ชำระครบ' && (
        <label>
          รับแล้วจริง (บาท)
          <input type="number" min={0} value={receivedAmount} onChange={(e) => setReceivedAmount(+e.target.value)} />
        </label>
      )}

      {status && <p className={status.ok ? 'poc-note' : 'form-error'}>{status.text}</p>}
      <button type="button" onClick={submit} disabled={save.isPending}>
        {save.isPending ? 'กำลังบันทึก...' : 'บันทึกยอดขาย'}
      </button>
    </div>
  );
}
