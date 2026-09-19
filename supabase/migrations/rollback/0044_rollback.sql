-- คืนพฤติกรรมก่อน 0044: ถอดกันเบิกเกิน + ถอดคีย์กันกดซ้ำ
-- ฟังก์ชันอนุมัติกลับไปใช้ greatest(0, …) ตาม 0038 / 0007

drop trigger if exists inv_trg_00_reject_stock_over_issue on public.inv_stock_transactions;
drop trigger if exists trg_00_reject_stock_over_issue on public.stock_transactions;

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
            update inv_item_stock
              set current_qty = greatest(0, current_qty + v_txn.quantity_delta), updated_at = now()
              where item_id = v_txn.item_id and branch_id = v_txn.branch_id;
            if not found then
              raise exception 'ไม่มีสต๊อกของสินค้านี้ในสาขานี้ ไม่สามารถอนุมัติปรับลดได้';
            end if;
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
        if fn_current_role() != 'admin' then
          raise exception 'เฉพาะ Admin เท่านั้นที่อนุมัติการปรับปรุงสต๊อกได้';
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
            update item_stock
              set current_qty = greatest(0, current_qty + v_txn.quantity_delta), updated_at = now()
              where item_id = v_txn.item_id and branch_id = v_txn.branch_id;
            if not found then
              raise exception 'ไม่มีสต๊อกของสินค้านี้ในสาขานี้ ไม่สามารถอนุมัติปรับลดได้';
            end if;
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

drop function if exists public.fn_reject_stock_over_issue();
drop function if exists public.fn_consume_stock_outflow(uuid, uuid, numeric);

drop index if exists public.sc_sales_tenant_request_uidx;
drop index if exists public.sc_payments_tenant_request_uidx;

alter table if exists public.sc_sales drop column if exists client_request_id;
alter table if exists public.sc_payments drop column if exists client_request_id;
