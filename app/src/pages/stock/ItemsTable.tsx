import { useMemo } from 'react';
import type { Item } from '../../lib/queries/items';
import { useToggleItemActive } from '../../lib/queries/items';

export default function ItemsTable({
  items,
  onEdit,
  onDelete,
}: {
  items: Item[];
  onEdit: (item: Item) => void;
  onDelete: (item: Item) => void;
}) {
  const toggleActive = useToggleItemActive();

  // จัดกลุ่มตามหมวดหมู่สำหรับมุมมองมือถือ — ลดความยาวที่ต้องเลื่อนหา และตัดตารางกว้างที่ต้องเลื่อนแนวนอนออก
  const grouped = useMemo(() => {
    const map = new Map<string, Item[]>();
    items.forEach((i) => {
      const key = i.category || 'ไม่ระบุหมวดหมู่';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(i);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'th'));
  }, [items]);

  if (!items.length) {
    return <p className="empty-row">ยังไม่มีสินค้า กด "เพิ่มสินค้าใหม่" เพื่อเริ่มต้น</p>;
  }

  return (
    <>
      {/* จอกว้าง (แท็บเล็ตแนวนอนขึ้นไป) — ตารางเต็มรูปแบบ */}
      <div className="hidden sm:block table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>ชื่อ</th>
              <th>ประเภท</th>
              <th>หมวดหมู่</th>
              <th>หน่วยฐาน</th>
              <th>หน่วยซื้อ</th>
              <th>สถานะ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td><strong>{i.name}</strong></td>
                <td>
                  <span className={'badge ' + (i.item_type === 'consumable' ? 'badge-amber' : 'badge-blue')}>
                    {i.item_type === 'consumable' ? 'สิ้นเปลือง' : 'คงคลัง'}
                  </span>
                </td>
                <td>{i.category}</td>
                <td>{i.base_unit}</td>
                <td>{i.purchase_unit} (={i.purchase_unit_qty} {i.base_unit})</td>
                <td>
                  <span className={'badge ' + (i.is_active ? 'badge-green' : 'badge-red')}>
                    {i.is_active ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}
                  </span>
                </td>
                <td className="row-actions">
                  <button onClick={() => onEdit(i)}>แก้ไข</button>
                  <button onClick={() => onDelete(i)}>ลบ</button>
                  <button onClick={() => toggleActive.mutate({ id: i.id, nextActive: !i.is_active })}>
                    {i.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* มือถือ — จัดกลุ่มตามหมวดหมู่ เป็นการ์ดแทนตารางกว้าง */}
      <div className="sm:hidden flex flex-col gap-4">
        {grouped.map(([category, catItems]) => (
          <div key={category}>
            <div className="flex items-center justify-between px-1 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{category}</span>
              <span className="text-[11px]" style={{ color: 'var(--muted)' }}>{catItems.length} รายการ</span>
            </div>
            <div className="flex flex-col gap-2">
              {catItems.map((i) => (
                <div key={i.id} className="init-stock-fieldset" style={{ margin: 0 }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{i.name}</div>
                      <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                        <span className={'badge ' + (i.item_type === 'consumable' ? 'badge-amber' : 'badge-blue')}>
                          {i.item_type === 'consumable' ? 'สิ้นเปลือง' : 'คงคลัง'}
                        </span>
                        <span className={'badge ' + (i.is_active ? 'badge-green' : 'badge-red')}>
                          {i.is_active ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}
                        </span>
                      </div>
                      <div className="text-xs mt-1.5" style={{ color: 'var(--muted)' }}>
                        หน่วย: {i.base_unit} · ซื้อเป็น {i.purchase_unit} (={i.purchase_unit_qty} {i.base_unit})
                      </div>
                    </div>
                  </div>
                  <div className="row-actions mt-2.5">
                    <button onClick={() => onEdit(i)}>แก้ไข</button>
                    <button onClick={() => onDelete(i)}>ลบ</button>
                    <button onClick={() => toggleActive.mutate({ id: i.id, nextActive: !i.is_active })}>
                      {i.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
