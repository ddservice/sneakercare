import { useMemo, useState } from 'react';
import { canManageStock } from '../../lib/types';
import { useAuth } from '../../lib/AuthContext';
import { type ItemStock, useSetAlertMuted, useUpdateMinStock } from '../../lib/queries/items';

function statusBadge(s: ItemStock) {
  if (s.alert_muted && s.current_qty <= s.min_stock_level) return <span className="badge badge-gray">ปิดแจ้งเตือน</span>;
  if (s.current_qty === 0) return <span className="badge badge-red">สินค้าหมด</span>;
  if (s.current_qty <= s.min_stock_level) return <span className="badge badge-amber">ใกล้หมดสต๊อก</span>;
  return <span className="badge badge-green">ปกติ</span>;
}

function MinStockInput({ s, canSeeCost, onSave }: { s: ItemStock; canSeeCost: boolean; onSave: (val: number) => void }) {
  if (!canSeeCost) return null;
  return (
    <input
      type="number"
      defaultValue={s.min_stock_level}
      style={{ width: 56, textAlign: 'center' }}
      onBlur={(e) => {
        const val = Number(e.target.value);
        if (!isNaN(val) && val >= 0 && val !== s.min_stock_level) onSave(val);
      }}
    />
  );
}

function MuteAlertButton({ s, canSeeCost, onToggle }: { s: ItemStock; canSeeCost: boolean; onToggle: (nextMuted: boolean) => void }) {
  if (!canSeeCost) return null;
  return (
    <button
      type="button"
      className={'ghost-btn-sm' + (s.alert_muted ? ' on' : '')}
      onClick={() => onToggle(!s.alert_muted)}
      title={s.alert_muted ? 'เปิดแจ้งเตือนสต๊อกต่ำสำหรับสินค้านี้อีกครั้ง' : 'ปิดแจ้งเตือนสต๊อกต่ำสำหรับสินค้านี้ (จะไม่ส่ง Telegram/ขึ้นแจ้งเตือนอีก จนกว่าจะเปิดใหม่)'}
    >
      {s.alert_muted ? 'เปิดแจ้งเตือน' : 'ไม่ต้องแจ้งเตือน'}
    </button>
  );
}

export default function StockStatusTable({ stock }: { stock: ItemStock[] }) {
  const { auth } = useAuth();
  const canSeeCost = canManageStock(auth?.role);
  const updateMin = useUpdateMinStock();
  const setAlertMuted = useSetAlertMuted();
  const [search, setSearch] = useState('');

  const lowStock = stock.filter((s) => s.current_qty <= s.min_stock_level && !s.alert_muted);
  const rows = stock.filter(
    (s) => !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.category.toLowerCase().includes(search.toLowerCase()),
  );

  // จัดกลุ่มตามหมวดหมู่สำหรับมุมมองมือถือ — ลดความยาวที่ต้องเลื่อนหา และตัดตารางกว้างที่ต้องเลื่อนแนวนอนออก
  const grouped = useMemo(() => {
    const map = new Map<string, ItemStock[]>();
    rows.forEach((s) => {
      const key = s.category || 'ไม่ระบุหมวดหมู่';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'th'));
  }, [rows]);

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

      {!rows.length ? (
        <p className="empty-row">ยังไม่มีสินค้าในคลัง</p>
      ) : (
        <>
          {/* จอกว้าง (แท็บเล็ตแนวนอนขึ้นไป) — ตารางเต็มรูปแบบ */}
          <div className="hidden sm:block table-scroll">
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
                  {canSeeCost && <th>แจ้งเตือน</th>}
                </tr>
              </thead>
              <tbody>
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
                    <td><MinStockInput s={s} canSeeCost={canSeeCost} onSave={(val) => updateMin.mutate({ itemId: s.item_id, newMin: val })} /></td>
                    <td>{statusBadge(s)}</td>
                    {canSeeCost && (
                      <td>
                        <MuteAlertButton s={s} canSeeCost={canSeeCost} onToggle={(muted) => setAlertMuted.mutate({ itemId: s.item_id, muted })} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* มือถือ — จัดกลุ่มตามหมวดหมู่ เป็นการ์ดแทนตารางกว้าง */}
          <div className="sm:hidden flex flex-col gap-4">
            {grouped.map(([category, items]) => (
              <div key={category}>
                <div className="flex items-center justify-between px-1 mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{category}</span>
                  <span className="text-[11px]" style={{ color: 'var(--muted)' }}>{items.length} รายการ</span>
                </div>
                <div className="flex flex-col gap-2">
                  {items.map((s) => (
                    <div key={s.item_id} className="init-stock-fieldset flex items-center justify-between gap-3" style={{ margin: 0 }}>
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{s.name}</div>
                        <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                          <span className={'badge ' + (s.item_type === 'consumable' ? 'badge-amber' : 'badge-blue')}>
                            {s.item_type === 'consumable' ? 'สิ้นเปลือง' : 'คงคลัง'}
                          </span>
                          {statusBadge(s)}
                        </div>
                        {canSeeCost && (
                          <div className="flex items-center gap-1.5 mt-1.5 text-xs" style={{ color: 'var(--muted)' }}>
                            ขั้นต่ำ: <MinStockInput s={s} canSeeCost={canSeeCost} onSave={(val) => updateMin.mutate({ itemId: s.item_id, newMin: val })} />
                          </div>
                        )}
                        {canSeeCost && (
                          <div className="mt-1.5">
                            <MuteAlertButton s={s} canSeeCost={canSeeCost} onToggle={(muted) => setAlertMuted.mutate({ itemId: s.item_id, muted })} />
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold">{s.current_qty} {s.base_unit}</div>
                        {canSeeCost && (
                          <div className="text-xs" style={{ color: 'var(--muted)' }}>
                            {s.avg_unit_cost.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
