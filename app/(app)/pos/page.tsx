import { requireProfile, requireModuleView } from "@/lib/auth";
import { text, num } from "@/lib/db-rows";
import { getSelectedBranchId } from "@/lib/branch";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_PAGE_SIZE, pageInfo, parsePage, rangeFor } from "@/lib/pagination";
import { PosClient, type OrderItem } from "./pos-client";

export default async function PosPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const profile = await requireProfile();
  requireModuleView(profile, "pos");
  const selectedBranchId = await getSelectedBranchId(profile);
  const supabase = await createClient();

  const page = parsePage((await searchParams).page);
  const { from, to } = rangeFor(page, DEFAULT_PAGE_SIZE);

  let query = supabase
    .from("service_orders")
    .select("*", { count: "exact" })
    .order("received_at", { ascending: false })
    .range(from, to);

  if (selectedBranchId) {
    query = query.eq("branch_id", selectedBranchId);
  }

  const { data: orders, count } = await query;

  const formattedOrders: OrderItem[] =
    orders && orders.length > 0
      ? orders.map((o) => ({
          id: o.id,
          order_no: o.order_no,
          customer_name: o.customer_name,
          customer_phone: o.customer_phone,
          shoe_brand: text(o.shoe_brand),
          shoe_model: text(o.shoe_model),
          shoe_color: text(o.shoe_color),
          shoe_size: text(o.shoe_size),
          status: (text(o.status) || "received") as OrderItem["status"],
          payment_method: (text(o.payment_method) || "unpaid") as OrderItem["payment_method"],
          // ⚠️ (แก้บั๊ก 2026-09-06) คอลัมน์จริงชื่อ total_amount ไม่ใช่ gross_amount
          gross_amount: num(o.total_amount),
          discount_amount: num(o.discount_amount),
          net_amount: num(o.net_amount),
          received_at: text(o.received_at),
          // ⚠️ คอลัมน์จริงชื่อ note (เอกพจน์) — อ่านผิดชื่อจึงได้ undefined มาตลอด
          notes: text(o.note),
        }))
      : [];

  const info = pageInfo(page, DEFAULT_PAGE_SIZE, count ?? null, formattedOrders.length);

  return <PosClient initialOrders={formattedOrders} pageInfo={info} />;
}
