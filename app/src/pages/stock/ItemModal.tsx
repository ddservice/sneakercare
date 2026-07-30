import { useState, type FormEvent } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { type Item, useSaveItem } from '../../lib/queries/items';
import type { Supplier } from '../../lib/queries/suppliers';
import { todayIso } from '../../lib/format';
import { ITEM_CATEGORIES } from '../../lib/itemCategories';

const Req = () => <span style={{ color: 'var(--red)' }}>*</span>;

export default function ItemModal({
  item,
  suppliers,
  existingCategories,
  onClose,
}: {
  item: Item | null;
  suppliers: Supplier[];
  existingCategories: string[];
  onClose: () => void;
}) {
  const { auth } = useAuth();
  const save = useSaveItem();

  // รวมหมวดหมู่แนะนำกับหมวดหมู่ที่มีอยู่จริงในระบบ (เผื่อมีหมวดหมู่ที่เคยพิมพ์เองไว้ก่อนหน้านี้) ให้เลือกซ้ำได้
  // ผ่าน datalist — ยังพิมพ์หมวดหมู่ใหม่เองได้เสมอ ไม่ได้บังคับเป็น dropdown ปิด
  const categoryOptions = [...new Set([...ITEM_CATEGORIES, ...existingCategories])].sort((a, b) => a.localeCompare(b, 'th'));

  const [name, setName] = useState(item?.name ?? '');
  const [itemType, setItemType] = useState<Item['item_type']>(item?.item_type ?? 'consumable');
  const [category, setCategory] = useState(item?.category ?? '');
  const [baseUnit, setBaseUnit] = useState(item?.base_unit ?? '');
  const [purchaseUnit, setPurchaseUnit] = useState(item?.purchase_unit ?? '');
  const [purchaseUnitQty, setPurchaseUnitQty] = useState(item?.purchase_unit_qty ?? 1);
  const [minStock, setMinStock] = useState(item?.default_min_stock_level ?? 0);

  const [initQty, setInitQty] = useState(0);
  const [initTotal, setInitTotal] = useState(0);
  const [initSupplier, setInitSupplier] = useState('');
  const [initDate, setInitDate] = useState(todayIso());

  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !category.trim() || !baseUnit.trim() || !purchaseUnit.trim()) {
      setError('กรุณากรอกข้อมูลให้ครบทุกช่อง');
      return;
    }
    if (purchaseUnitQty <= 0) {
      setError('อัตราแปลงหน่วยต้องมากกว่า 0');
      return;
    }
    if (initDate > todayIso()) {
      setError('วันที่รับของเข้าเป็นวันที่ในอนาคตไม่ได้');
      return;
    }
    try {
      await save.mutateAsync({
        id: item?.id ?? null,
        payload: {
          name: name.trim(),
          item_type: itemType,
          category: category.trim(),
          base_unit: baseUnit.trim(),
          purchase_unit: purchaseUnit.trim(),
          purchase_unit_qty: purchaseUnitQty,
          default_min_stock_level: minStock,
        },
        initialStock: item
          ? null
          : { qty: initQty, total: initTotal, supplierId: initSupplier || null, date: initDate, performedBy: auth!.userId },
        performedBy: auth!.userId,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
    }
  };

  return (
    <div className="modal-overlay">
      <form className="modal-card" style={{ maxWidth: 560 }} onSubmit={submit}>
        <h3>{item ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</h3>
        <p className="poc-note">ช่องที่มี <Req /> จำเป็นต้องกรอก ช่องอื่นไม่บังคับ</p>

        <fieldset className="init-stock-fieldset">
          <legend>ข้อมูลสินค้า</legend>
          <label>
            ชื่อสินค้า <Req />
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label>
              ประเภท <Req />
              <select value={itemType} onChange={(e) => setItemType(e.target.value as Item['item_type'])}>
                <option value="consumable">สิ้นเปลือง</option>
                <option value="inventory">คงคลัง</option>
              </select>
            </label>
            <label>
              หมวดหมู่ <Req />
              <input value={category} onChange={(e) => setCategory(e.target.value)} list="item_category_datalist" placeholder="เลือกหรือพิมพ์หมวดหมู่ใหม่" />
              <datalist id="item_category_datalist">
                {categoryOptions.map((c) => <option key={c} value={c} />)}
              </datalist>
            </label>
          </div>
        </fieldset>

        <fieldset className="init-stock-fieldset">
          <legend>หน่วยนับ</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label>
              หน่วยฐาน (ใช้ตัดสต๊อก เช่น ml, g, ชิ้น) <Req />
              <input value={baseUnit} onChange={(e) => setBaseUnit(e.target.value)} />
            </label>
            <label>
              หน่วยซื้อ <Req />
              <input value={purchaseUnit} onChange={(e) => setPurchaseUnit(e.target.value)} />
            </label>
          </div>
          <label>
            1 หน่วยซื้อ = กี่หน่วยฐาน <Req />
            <input type="number" min={0.001} step={0.001} value={purchaseUnitQty}
              onChange={(e) => setPurchaseUnitQty(+e.target.value)} />
          </label>
        </fieldset>

        <fieldset className="init-stock-fieldset">
          <legend>การแจ้งเตือนสต๊อก (ไม่บังคับ)</legend>
          <label>
            จุดสั่งซื้อขั้นต่ำ
            <input type="number" min={0} value={minStock} onChange={(e) => setMinStock(+e.target.value)} />
            <span className="poc-note">เว้นว่างไว้ = ปิดแจ้งเตือนสต๊อกต่ำสำหรับสินค้านี้</span>
          </label>
        </fieldset>

        {!item && (
          <fieldset className="init-stock-fieldset">
            <legend>สต๊อกเริ่มต้น (ไม่บังคับ — ใส่เฉพาะถ้ามีของอยู่แล้วตอนเพิ่มรายการนี้)</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label>
                จำนวน (หน่วยซื้อ)
                <input type="number" min={0} value={initQty} onChange={(e) => setInitQty(+e.target.value)} />
              </label>
              <label>
                ยอดที่จ่ายจริงทั้งหมด
                <input type="number" min={0} value={initTotal} onChange={(e) => setInitTotal(+e.target.value)} />
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label>
                Supplier
                <select value={initSupplier} onChange={(e) => setInitSupplier(e.target.value)}>
                  <option value="">- ไม่ระบุ -</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label>
                วันที่รับของเข้า
                <input type="date" max={todayIso()} value={initDate} onChange={(e) => setInitDate(e.target.value)} />
              </label>
            </div>
          </fieldset>
        )}

        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>ยกเลิก</button>
          <button type="submit" disabled={save.isPending}>
            {save.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </form>
    </div>
  );
}
