import { useState } from 'react';
import { canManageStock } from '../../lib/types';
import { useAuth } from '../../lib/AuthContext';
import { type ItemStock, useUpdateMinStock } from '../../lib/queries/items';

function statusBadge(s: ItemStock) {
  if (s.current_qty === 0) return <span className="badge badge-red">สินค้าหมด</span>;
  if (s.current_qty <= s.min_stock_level) return <span className="badge badge-amber">ใกล้หมดสต๊อก</span>;
  return <span className="badge badge-green">ปกติ</span>;
}

export default function StockStatusTable({ stock }: { stock: ItemStock[] }) {
  const { auth } = useAuth();
  const canSeeCost = canManageStock(auth?.role);
  const updateMin = useUpdateMinStock();
  const [search, setSearch] = useState('');

  const lowStock = stock.filter((s) => s.current_qty <= s.min_stock_level);
  const rows = stock.filter(
    (s) => !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.category.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      {lowStock.length > 0 && (
        <div className="alert-bar">
          แจ้งเตือนวัสดุคลังสินค้าใกล้หมด หรือหมดสต๊อก:{' '}
          <strong>{lowStock.map((s) => `${s.name} (คงเหลือ: ${s.current_qty} ${s.base_unit})`).join(', ')}</strong>
        </div>
      )}
      <input
        placeholder="ค้นหาสินค้า/หมวดหมู่..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 10, maxWidth: 260 }}
      />
      <table className="data-table">
        <thead>
          <tr>
            <th>ชื่อ</th>
            <th>ประเภท</th>
            <th>หมวดหมู่</th>
            <th>คงเหลือ</th>
            {canSeeCost && <th>ต้นทุนเฉลี่ย</th>}
            <th>จุดสั่งซื้อขั้นต่ำ</th>
            <th>สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {!rows.length && (
            <tr><td colSpan={canSeeCost ? 7 : 6} className="empty-row">ยังไม่มีสินค้าในคลัง</td></tr>
          )}
          {rows.map((s) => (
            <tr key={s.item_id}>
              <td><strong>{s.name}</strong></td>
              <td>
                <span className={'badge ' + (s.item_type === 'consumable' ? 'badge-amber' : 'badge-blue')}>
                  {s.item_type === 'consumable' ? 'สิ้นเปลือง' : 'คงคลัง'}
                </span>
              </td>
              <td><span className="badge badge-blue">{s.category}</span></td>
              <td style={{ fontWeight: 700 }}>{s.current_qty} {s.base_unit}</td>
              {canSeeCost && <td>{s.avg_unit_cost.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿</td>}
              <td>
                <input
                  type="number"
                  defaultValue={s.min_stock_level}
                  style={{ width: 64, textAlign: 'center' }}
                  disabled={!canSeeCost}
                  onBlur={(e) => {
                    const val = Number(e.target.value);
                    if (!isNaN(val) && val >= 0 && val !== s.min_stock_level) {
                      updateMin.mutate({ itemId: s.item_id, newMin: val });
                    }
                  }}
                />
              </td>
              <td>{statusBadge(s)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
