-- 0045_sales_service_order_link.sql
--
-- ระยะ 3: ผูกแถว sc_sales กับใบรับงาน (คีย์กันนับซ้ำชั้นที่สอง)
-- ชั้นแรกที่แอปใช้จริงอยู่แล้วคือ client_request_id = service_orders.id (จาก 0044)
-- คอลัมน์นี้มีไว้ค้น/รายงาน ห้ามมีสองแถวขายต่อใบรับงานเดียวกัน
--
-- รันซ้ำได้ · ยังไม่ apply production จนกว่าเจ้าของสั่ง
-- ไม่แตะแถวขายเก่า · ไม่เปลี่ยนสูตร dashboard

do $$
begin
  if to_regclass('public.sc_sales') is not null then
    execute $sql$
      alter table public.sc_sales add column if not exists service_order_id uuid
    $sql$;
    execute $sql$
      create unique index if not exists sc_sales_tenant_order_uidx
        on public.sc_sales (tenant_id, service_order_id)
        where service_order_id is not null
    $sql$;
  end if;
end
$$;
