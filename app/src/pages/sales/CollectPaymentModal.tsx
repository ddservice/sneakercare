import { useState } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { useSavePayment } from '../../lib/queries/sales';

const todayIso = () => new Date().toISOString().slice(0, 10);
const fc = (v: number) => v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CollectPaymentModal({
  saleDate,
  outstanding,
  alreadyReceived,
  onClose,
}: {
  saleDate: string;
  outstanding: number;
  alreadyReceived: number;
  onClose: () => void;
}) {
  const { auth } = useAuth();
  const save = useSavePayment();
  const [receivedDate, setReceivedDate] = useState(todayIso());
  const [amount, setAmount] = useState(outstanding);
  const [method, setMethod] = useState('เงินสด');
  const [error, setError] = useState('');

  const submit = async () => {
    if (!receivedDate) { setError('กรุณาระบุวันที่รับ'); return; }
    if (amount <= 0) { setError('กรุณาระบุจำนวนเงิน'); return; }
    try {
      await save.mutateAsync({
        saleDate, receivedDate, amount, payMethod: method,
        recordedBy: auth?.displayName || auth?.username || 'Staff',
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <h3>รับชำระเงิน</h3>
        <p className="poc-note">
          งานวันที่ {saleDate} — ค้างชำระ {fc(outstanding)} ฿
          {alreadyReceived > 0 && <><br />รับไปแล้ว {fc(alreadyReceived)} ฿</>}
        </p>
        <label>
          วันที่รับเงิน
          <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
        </label>
        <label>
          จำนวนที่รับ (บาท)
          <input type="number" min={0.01} step={0.01} value={amount} onChange={(e) => setAmount(+e.target.value)} />
        </label>
        <label>
          ช่องทาง
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="เงินสด">เงินสด</option>
            <option value="โอน">โอนเงิน</option>
            <option value="อื่นๆ">อื่นๆ</option>
          </select>
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>ยกเลิก</button>
          <button type="button" onClick={submit} disabled={save.isPending}>
            {save.isPending ? 'กำลังบันทึก...' : 'บันทึกการรับเงิน'}
          </button>
        </div>
      </div>
    </div>
  );
}
