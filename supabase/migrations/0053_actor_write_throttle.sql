-- Serialize the shared actor budget across different concurrent command keys.
create or replace function rrs_private.replay(p_tenant uuid,p_actor uuid,p_command text,p_request text,p_data jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare old rrs_private.commands%rowtype;
begin
 if p_request is null or length(p_request) not between 1 and 120 or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'คีย์หรือข้อมูลรายการไม่ถูกต้อง' using errcode='22023'; end if;
 -- Actor lock precedes request lock for every command, including retries.
 -- A per-request lock alone cannot serialize the actor-wide minute budget.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor::text,53));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tenant::text||p_command||p_request,49));
 select * into old from rrs_private.commands where tenant_id=p_tenant and command=p_command and request_id=p_request;
 if found then
  if old.actor_id is distinct from p_actor or old.payload is distinct from p_data then raise exception 'คีย์เดิมแต่ข้อมูลเปลี่ยน กรุณาเริ่มรายการใหม่' using errcode='23514'; end if;
  return old.response||jsonb_build_object('replay',true);
 end if;
 if (select count(*) from rrs_private.commands where actor_id=p_actor and created_at>now()-interval '1 minute')>=60 then raise exception 'ทำรายการถี่เกินไป กรุณารอสักครู่'; end if;
 return null;
end $$;

create index if not exists commands_actor_created_idx on rrs_private.commands(actor_id,created_at);
