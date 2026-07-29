import { useState } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { useBranchId } from '../../lib/queries/branch';
import { useItems } from '../../lib/queries/items';
import { useSuppliers } from '../../lib/queries/suppliers';
import {
  downloadTemplate, importSalesRows, importStockRows, parseExcelFile, type ImportResult,
} from '../../lib/importExport';

type ImportType = 'sales' | 'stock';

export default function ImportExportSection() {
  const { auth } = useAuth();
  const branchId = useBranchId();
  const { data: items } = useItems();
  const { data: suppliers } = useSuppliers();

  const [type, setType] = useState<ImportType>('sales');
  const [rows, setRows] = useState<unknown[][] | null>(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');

  const onFileSelected = async (file: File | undefined) => {
    setResult(null);
    setError('');
    if (!file) return;
    setFileName(file.name);
    try {
      const parsed = await parseExcelFile(file);
      if (parsed.length < 2) { setError('ไฟล์ไม่มีข้อมูลแถวรายการ'); setRows(null); return; }
      setRows(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'อ่านไฟล์ไม่สำเร็จ');
      setRows(null);
    }
  };

  const runImport = async () => {
    if (!rows) return;
    if (type === 'stock' && !branchId) {
      setError('ยังโหลดข้อมูลสาขาไม่เสร็จ กรุณารอสักครู่แล้วลองใหม่');
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const recordedBy = auth?.displayName || auth?.username || 'Import Tool';
      const res = type === 'sales'
        ? await importSalesRows(rows, recordedBy)
        : await importStockRows(rows, items ?? [], suppliers ?? [], branchId!, auth?.userId ?? '');
      setResult(res);
      setRows(null);
      setFileName('');
    } finally {
      setBusy(false);
    }
  };

  const previewRows = rows?.slice(1, 6) ?? [];
  const headerRow = rows?.[0] ?? [];

  return (
    <div className="card section-gap">
      <h2>นำเข้า/ส่งออกข้อมูล Excel</h2>
      <p className="poc-note">
        นำเข้ายอดขายเขียนทับข้อมูลของวันที่ซ้ำกันเสมอ (upsert) — นำเข้าคลังสินค้าต้องมีชื่อสินค้า (และ
        Supplier ถ้าระบุ) ตรงกับที่มีอยู่ในระบบเป๊ะ ไม่งั้นแถวนั้นจะล้มเหลว
      </p>
      <label>
        ประเภทข้อมูล
        <select value={type} onChange={(e) => { setType(e.target.value as ImportType); setRows(null); setResult(null); }}>
          <option value="sales">ยอดขายรายวัน</option>
          <option value="stock">รับของเข้าคลัง</option>
        </select>
      </label>
      <div className="row-actions" style={{ marginBottom: 14 }}>
        <button type="button" onClick={() => downloadTemplate(type)}>ดาวน์โหลด Template</button>
      </div>
      <label>
        เลือกไฟล์ (.xlsx / .xls / .csv)
        <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => onFileSelected(e.target.files?.[0])} />
      </label>
      {error && <p className="form-error">{error}</p>}
      {rows && (
        <div className="init-stock-fieldset">
          <legend>ตัวอย่างข้อมูล ({fileName}) — พบทั้งหมด {rows.length - 1} แถว</legend>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>{(headerRow as unknown[]).map((h, i) => <th key={i}>{String(h ?? '')}</th>)}</tr>
              </thead>
              <tbody>
                {previewRows.map((r, i) => (
                  <tr key={i}>{(r as unknown[]).map((c, j) => <td key={j}>{c === undefined ? '' : String(c)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={runImport} disabled={busy} style={{ marginTop: 10 }}>
            {busy ? 'กำลังนำเข้า...' : `นำเข้าข้อมูลทั้ง ${rows.length - 1} แถว`}
          </button>
        </div>
      )}
      {result && (
        <div className="init-stock-fieldset">
          <legend>ผลการนำเข้า</legend>
          <p>สำเร็จ {result.successCount} แถว — ล้มเหลว {result.failCount} แถว</p>
          {result.errors.length > 0 && (
            <ul style={{ fontSize: 12, color: 'var(--red)', margin: 0, paddingLeft: 18 }}>
              {result.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
