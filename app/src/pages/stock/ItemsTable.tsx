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

  if (!items.length) {
    return <p className="empty-row">ยังไม่มีสินค้า กด "เพิ่มสินค้าใหม่" เพื่อเริ่มต้น</p>;
  }

  return (
    <div className="table-scroll">
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
  );
}
