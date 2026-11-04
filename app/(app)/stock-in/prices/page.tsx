import Link from 'next/link';
import { requireProfile, requireModuleView } from '@/lib/auth';
import { getSelectedBranchId } from '@/lib/branch';
import { createClient } from '@/lib/supabase/server';
import { bangkokToday, type PurchaseReceipt } from '@/lib/purchase-receipts';
import { purchaseRpcError } from '@/lib/purchase-rpc-error';
import { InventoryShell } from '@/components/inventory-shell';
import { NeedBranchEmpty } from '@/components/need-branch-empty';
import { PurchasePrices } from './purchase-prices';

export default async function PurchasePricesPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const profile = await requireProfile();
  requireModuleView(profile, 'stock-in');
  const branchId = await getSelectedBranchId(profile);
  if (!branchId) return <InventoryShell title="ราคาซื้อ / ร้านค้า" role={profile.role}><NeedBranchEmpty title="เลือกสาขาเพื่อดูราคาซื้อ" description="แสดงเฉพาะประวัติซื้อของสาขาที่เลือก" /></InventoryShell>;
  const params = await searchParams;
  const today = bangkokToday();
  const from = params.from || new Date(Date.parse(`${today}T00:00:00Z`) - 365*86400000).toISOString().slice(0,10);
  const to = params.to || today;
  const valid = [from,to].every(d=>/^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0,10)===d)
    && from <= to && (Date.parse(to)-Date.parse(from))/86400000 <= 366;
  const db = await createClient();
  const result = valid ? await db.rpc('inv_fn_purchase_history', { p_branch_id:branchId,p_from:from,p_to:to }) : null;
  const error = !valid ? 'เลือกช่วงวันที่จริง เรียงจากเก่าไปใหม่ และไม่เกิน 1 ปี' : result?.error ? purchaseRpcError(result.error) : null;
  const rows = Array.isArray(result?.data) ? result.data as unknown as PurchaseReceipt[] : [];
  return <InventoryShell title="ราคาซื้อ / ร้านค้า" description="เปรียบเทียบต้นทุนรวมค่าส่งและส่วนลดต่อหน่วยฐาน ของสินค้าแบบเดียวกัน" role={profile.role} actions={<Link href="/stock-in" className="inline-flex min-h-11 items-center text-sm underline">เพิ่มสินค้าเข้าคลัง</Link>}>
    <form className="flex flex-wrap items-end gap-3 rounded-xl border p-4">
      <label className="space-y-1 text-sm">ตั้งแต่วันที่<input aria-label="ตั้งแต่วันที่" name="from" type="date" required defaultValue={from} className="block h-11 rounded-md border bg-background px-3" /></label>
      <label className="space-y-1 text-sm">ถึงวันที่<input aria-label="ถึงวันที่" name="to" type="date" required defaultValue={to} className="block h-11 rounded-md border bg-background px-3" /></label>
      <button type="submit" className="h-11 rounded-md bg-primary px-4 text-sm text-primary-foreground">ดูช่วงนี้</button>
    </form>
    {error ? <p role="alert" className="rounded-xl border p-4 text-sm text-destructive">{error}</p> : rows.length > 5000 ? <p role="alert" className="rounded-xl border p-4 text-sm">ช่วงนี้มีมากกว่า 5,000 รายการ กรุณาลดช่วงวันที่เพื่อให้สถิติครบถ้วน</p> : <PurchasePrices rows={rows} />}
  </InventoryShell>;
}
