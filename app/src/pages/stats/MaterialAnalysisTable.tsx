import { useItemStock } from '../../lib/queries/items';

function urgencyOf(qty: number, minAlert: number) {
  const ratio = minAlert > 0 ? qty / minAlert : 99;
  if (qty === 0) return 0;
  if (ratio <= 1) return 1;
  if (ratio <= 2) return 2;
  return 3;
}

const BADGE: Record<number, { cls: string; rec: string }> = {
  0: { cls: 'badge-red', rec: 'สั่งซื้อด่วนที่สุด!' },
  1: { cls: 'badge-amber', rec: 'ควรสั่งซื้อเพิ่ม' },
  2: { cls: 'badge-blue', rec: 'ติดตามสต๊อก' },
  3: { cls: 'badge-green', rec: '—' },
};
const LABEL: Record<number, string> = { 0: 'สินค้าหมด', 1: 'ใกล้หมด', 2: 'เฝ้าระวัง', 3: 'ปกติ' };

export default function MaterialAnalysisTable() {
  const { data: stock, isLoading } = useItemStock();

  if (isLoading) return <p>กำลังโหลด...</p>;

  const rows = (stock ?? [])
    .map((s) => ({ ...s, urgency: urgencyOf(s.current_qty, s.min_stock_level) }))
    .sort((a, b) => a.urgency - b.urgency);
  const needReorder = rows.filter((r) => r.urgency < 3).length;

  if (!rows.length) {
    return <p className="empty-row">ไม่มีข้อมูลวัสดุ — กรุณาเพิ่มข้อมูลในแท็บสต๊อก</p>;
  }

  return (
    <div>
      {needReorder > 0 && <p className="poc-note">ต้องสั่งซื้อ {needReorder} รายการ</p>}
      <table className="data-table">
        <thead>
          <tr>
            <th>ชื่อ</th><th>หมวดหมู่</th><th>คงเหลือ</th><th>จุดสั่งซื้อขั้นต่ำ</th><th>สถานะ</th><th>คำแนะนำ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.item_id}>
              <td>{r.name}</td>
              <td>{r.category}</td>
              <td>{r.current_qty} {r.base_unit}</td>
              <td>{r.min_stock_level} {r.base_unit}</td>
              <td><span className={'badge ' + BADGE[r.urgency].cls}>{LABEL[r.urgency]}</span></td>
              <td className="poc-note">{BADGE[r.urgency].rec}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
