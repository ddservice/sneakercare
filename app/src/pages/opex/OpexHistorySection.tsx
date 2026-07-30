import { useMemo, useState } from 'react';
import { useOpexHistory, type OpexHistoryRow } from '../../lib/queries/opexHistory';
import { fc2 } from '../../lib/format';
import MonthPicker from '../../components/MonthPicker';
import { IconSearch } from '../../components/Icons';
import SortableHeader from '../../components/SortableHeader';

const sumCat = (items: { category: string; amount: number }[], cat: string) =>
  items.filter((i) => i.category === cat).reduce((s, i) => s + i.amount, 0);

interface Row extends OpexHistoryRow {
  fixedAmt: number;
  staffAmt: number;
  taxAmt: number;
  grand: number;
}

type SortKey = 'month' | 'saved_at' | 'saved_by' | 'grand';
const SORT_LABEL: Record<SortKey, string> = {
  month: 'เดือน', saved_at: 'บันทึกเมื่อ', saved_by: 'บันทึกโดย', grand: 'ยอดรวม',
};

export default function OpexHistorySection() {
  const [monthFilter, setMonthFilter] = useState('');
  const monthKey = monthFilter ? (() => { const [y, mm] = monthFilter.split('-'); return `${mm}/${y}`; })() : null;
  const { data: rawRows, isLoading } = useOpexHistory(monthKey);

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('saved_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) { setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); return; }
    setSortKey(key);
    setSortDir('desc');
  };

  const rows: Row[] = useMemo(() => (rawRows ?? []).map((h) => {
    const fixedAmt = sumCat(h.items, 'ค่าดำเนินการ');
    const staffAmt = sumCat(h.items, 'ค่าแรงพนักงาน');
    const taxAmt = sumCat(h.items, 'ภาษี');
    return { ...h, fixedAmt, staffAmt, taxAmt, grand: fixedAmt + staffAmt + taxAmt };
  }), [rawRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = !q ? rows : rows.filter((h) =>
      h.month.toLowerCase().includes(q) ||
      h.saved_by.toLowerCase().includes(q) ||
      (h.change_note ?? '').toLowerCase().includes(q),
    );
    const sorted = [...list].sort((a, b) => {
      const cmp = sortKey === 'grand' ? a.grand - b.grand : String(a[sortKey]).localeCompare(String(b[sortKey]));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [rows, search, sortKey, sortDir]);

  return (
    <div className="card section-gap">
      <h2>ประวัติการแก้ไขค่าใช้จ่ายย้อนหลัง</h2>
      <p className="poc-note">
        ดูย้อนหลังได้อย่างเดียว — ยังไม่รองรับการ "คืนค่า" เวอร์ชันเก่า (เสี่ยงทับข้อมูลปัจจุบันโดยไม่ตั้งใจ)
        ถ้าต้องการแก้ไขจริง ให้แก้ที่หน้าปกติ (ค่าใช้จ่ายคงที่/เงินเดือน) ของเดือนนั้นแทน
      </p>
      <label>
        กรองเฉพาะเดือน (เว้นว่าง = ทั้งหมด)
        <MonthPicker value={monthFilter || (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })()} onChange={setMonthFilter} />
      </label>

      {isLoading ? (
        <p>กำลังโหลด...</p>
      ) : !rows.length ? (
        <p className="empty-row">ยังไม่มีประวัติการแก้ไข</p>
      ) : (
        <>
          <div className="table-filter">
            <IconSearch />
            <input placeholder="ค้นหา เดือน / ผู้บันทึก / หมายเหตุ" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <SortableHeader label={SORT_LABEL.month} sortKey="month" active={sortKey === 'month'} dir={sortDir} onClick={toggleSort} />
                  <th>เวอร์ชัน</th>
                  <SortableHeader label={SORT_LABEL.saved_by} sortKey="saved_by" active={sortKey === 'saved_by'} dir={sortDir} onClick={toggleSort} />
                  <SortableHeader label={SORT_LABEL.saved_at} sortKey="saved_at" active={sortKey === 'saved_at'} dir={sortDir} onClick={toggleSort} />
                  <th>หมายเหตุ</th>
                  <SortableHeader label={SORT_LABEL.grand} sortKey="grand" active={sortKey === 'grand'} dir={sortDir} onClick={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="empty-row">ไม่พบรายการที่ตรงกับคำค้นหา</td></tr>
                ) : filtered.map((h) => (
                  <tr key={h.id}>
                    <td>{h.month}</td>
                    <td>v{h.version}</td>
                    <td>{h.saved_by}</td>
                    <td>{new Date(h.saved_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                    <td>{h.change_note && h.change_note !== '(ไม่มีหมายเหตุ)' ? h.change_note : '-'}</td>
                    <td>
                      <strong>{fc2(h.grand)} ฿</strong>
                      <div className="poc-note !m-0">ดำเนินการ {fc2(h.fixedAmt)} · แรง {fc2(h.staffAmt)} · ภาษี {fc2(h.taxAmt)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
