-- 0044_reject_overissue_and_idempotency.sql
--
-- ระยะ 2: (1) ปฏิเสธเบิก/ปรับลดเกินสต๊อกที่ DB แทน greatest(0, …)
--         (2) คีย์กันกดบันทึกขาย/รับชำระซ้ำ
--
-- ไม่แตะแถว ledger เก่า · รันซ้ำได้ · ยังไม่ apply production จนกว่าเจ้าของสั่ง
--
-- เส้นทางขายที่ตัดสต๊อกทันที = INSERT แถว approved บนตารางธุรกรรม
-- เส้นทางปรับของ Co-Admin = inv_fn_approve_adjustment / fn_approve_adjustment อัปเดตยอดเอง
-- ทั้งสองเส้นต้องปฏิเสธเหมือนกัน

-- ── 1) ล็อกแถวสต๊อกแล้วปฏิเสธถ้าคงเหลือไม่พอ (ก่อน trigger ถัวเฉลี่ยทำงาน) ──

create or replace function public.fn_reject_stock_over_issue()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_qty numeric;
begin
  if new.status is distinct from 'approved' then
    return new;
  end if;
  if new.quantity_delta >= 0 then
    return new;
  end if;

  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'inv_item_stock' and c.relkind = 'r'
  ) then
    select current_qty into v_qty
      from public.inv_item_stock
      where item_id = new.item_id and branch_id = new.branch_id
      for update;
  elsif exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'item_stock' and c.relkind = 'r'
  ) then
    select current_qty into v_qty
      from public.item_stock
      where item_id = new.item_id and branch_id = new.branch_id
      for update;
  else
    raise exception 'ไม่พบตารางสต๊อก';
  end if;

  if not found or coalesce(v_qty, 0) + new.quantity_delta < 0 then
    raise exception 'สต๊อกไม่พอ ไม่สามารถเบิกหรือปรับลดเกินจำนวนคงเหลือได้ (เหลือ % ต้องการ %)',
      coalesce(v_qty, 0), abs(new.quantity_delta);
  end if;
  return new;
end;
$function$;

create or replace function public.fn_consume_stock_outflow(
  p_item_id uuid,
  p_branch_id uuid,
  p_delta numeric
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_updated int := 0;
begin
  if p_delta >= 0 then
    raise exception 'fn_consume_stock_outflow ใช้กับยอดที่ตัดสต๊อกเท่านั้น';
  end if;

  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'inv_item_stock' and c.relkind = 'r'
  ) then
    update public.inv_item_stock
      set current_qty = current_qty + p_delta, updated_at = now()
      where item_id = p_item_id
        and branch_id = p_branch_id
        and current_qty + p_delta >= 0;
    get diagnostics v_updated = row_count;
  elsif exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'item_stock' and c.relkind = 'r'
  ) then
    update public.item_stock
      set current_qty = current_qty + p_delta, updated_at = now()
      where item_id = p_item_id
        and branch_id = p_branch_id
        and current_qty + p_delta >= 0;
    get diagnostics v_updated = row_count;
  else
    raise exception 'ไม่พบตารางสต๊อก';
  end if;

  if v_updated = 0 then
    raise exception 'สต๊อกไม่พอ ไม่สามารถเบิกหรือปรับลดเกินจำนวนคงเหลือได้';
  end if;
end;
$function$;

do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'inv_stock_transactions' and c.relkind = 'r'
  ) then
    execute $sql$
      drop trigger if exists inv_trg_00_reject_stock_over_issue on public.inv_stock_transactions;
      create trigger inv_trg_00_reject_stock_over_issue
      before insert on public.inv_stock_transactions
      for each row execute function public.fn_reject_stock_over_issue()
    $sql$;
  end if;

  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'stock_transactions' and c.relkind = 'r'
  ) then
    execute $sql$
      drop trigger if exists trg_00_reject_stock_over_issue on public.stock_transactions;
      create trigger trg_00_reject_stock_over_issue
      before insert on public.stock_transactions
      for each row execute function public.fn_reject_stock_over_issue()
    $sql$;
  end if;
end
$$;

-- ── 2) อนุมัติปรับลด: ห้ามปัดเหลือ 0 ──

do $$
begin
  if to_regprocedure('public.inv_fn_approve_adjustment(uuid, boolean)') is not null then
    execute $sql$
      create or replace function public.inv_fn_approve_adjustment(p_txn_id uuid, p_approve boolean)
      returns void
      language plpgsql
      security definer
      set search_path to 'public', 'pg_temp'
      as $function$
      declare
        v_txn inv_stock_transactions%rowtype;
      begin
        if inv_fn_current_role() not in ('admin', 'co-admin', 'super_admin') then
          raise exception 'เฉพาะ Admin, Co-Admin หรือ Super Admin เท่านั้นที่อนุมัติการปรับปรุงสต๊อกได้';
        end if;

        select * into v_txn from inv_stock_transactions
          where id = p_txn_id and status = 'pending_approval'
          for update;
        if not found then
          raise exception 'ไม่พบรายการที่รออนุมัติ';
        end if;

        if inv_fn_current_role() = 'co-admin' and v_txn.branch_id != inv_fn_current_branch() then
          raise exception 'ไม่มีสิทธิ์อนุมัติรายการของสาขาอื่น';
        end if;

        if p_approve then
          update inv_stock_transactions set status = 'approved', approved_by = auth.uid() where id = p_txn_id;

          if v_txn.txn_type = 'adjustment_increase' then
            insert into inv_item_stock (item_id, branch_id, current_qty, updated_at)
            values (v_txn.item_id, v_txn.branch_id, v_txn.quantity_delta, now())
            on conflict (item_id, branch_id) do update
              set current_qty = inv_item_stock.current_qty + v_txn.quantity_delta, updated_at = now();
          else
            perform public.fn_consume_stock_outflow(v_txn.item_id, v_txn.branch_id, v_txn.quantity_delta);
          end if;
        else
          update inv_stock_transactions set status = 'rejected', approved_by = auth.uid() where id = p_txn_id;
        end if;
      end;
      $function$
    $sql$;
  end if;

  if to_regprocedure('public.fn_approve_adjustment(uuid, boolean)') is not null then
    execute $sql$
      create or replace function public.fn_approve_adjustment(p_txn_id uuid, p_approve boolean)
      returns void
      language plpgsql
      security definer
      set search_path to 'public', 'pg_temp'
      as $function$
      declare
        v_txn stock_transactions%rowtype;
      begin
        if fn_current_role() not in ('admin', 'co-admin', 'super_admin') then
          raise exception 'เฉพาะ Admin, Co-Admin หรือ Super Admin เท่านั้นที่อนุมัติการปรับปรุงสต๊อกได้';
        end if;

        select * into v_txn from stock_transactions
          where id = p_txn_id and status = 'pending_approval'
          for update;
        if not found then
          raise exception 'ไม่พบรายการที่รออนุมัติ';
        end if;

        if p_approve then
          update stock_transactions set status = 'approved', approved_by = auth.uid() where id = p_txn_id;

          if v_txn.txn_type = 'adjustment_increase' then
            insert into item_stock (item_id, branch_id, current_qty, updated_at)
            values (v_txn.item_id, v_txn.branch_id, v_txn.quantity_delta, now())
            on conflict (item_id, branch_id) do update
              set current_qty = item_stock.current_qty + v_txn.quantity_delta, updated_at = now();
          else
            perform public.fn_consume_stock_outflow(v_txn.item_id, v_txn.branch_id, v_txn.quantity_delta);
          end if;
        else
          update stock_transactions set status = 'rejected', approved_by = auth.uid() where id = p_txn_id;
        end if;
      end;
      $function$
    $sql$;
  end if;
end
$$;

-- ── 3) กันบันทึกขาย/รับชำระซ้ำด้วย client_request_id ──

do $$
begin
  if to_regclass('public.sc_sales') is not null then
    execute $sql$
      alter table public.sc_sales add column if not exists client_request_id uuid
    $sql$;
    execute $sql$
      create unique index if not exists sc_sales_tenant_request_uidx
        on public.sc_sales (tenant_id, client_request_id)
        where client_request_id is not null
    $sql$;
  end if;

  if to_regclass('public.sc_payments') is not null then
    execute $sql$
      alter table public.sc_payments add column if not exists client_request_id uuid
    $sql$;
    execute $sql$
      create unique index if not exists sc_payments_tenant_request_uidx
        on public.sc_payments (tenant_id, client_request_id)
        where client_request_id is not null
    $sql$;
  end if;
end
$$;
