import { requireProfile } from "@/lib/auth";
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
          shoe_brand: o.shoe_brand,
          shoe_model: o.shoe_model,
          shoe_color: o.shoe_color,
          shoe_size: o.shoe_size,
          status: o.status,
          payment_method: o.payment_method,
          gross_amount: Number(o.gross_amount ?? 0),
          discount_amount: Number(o.discount_amount ?? 0),
          net_amount: Number(o.net_amount ?? 0),
          received_at: o.received_at,
          notes: o.notes,
        }))
      : [];

  const info = pageInfo(page, DEFAULT_PAGE_SIZE, count ?? null, formattedOrders.length);

  return <PosClient initialOrders={formattedOrders} pageInfo={info} />;
}
