import fs from 'node:fs';
export function expenseFixtureSql(){
 const wht=fs.readFileSync('supabase/migrations/0042_wht_rent.sql','utf8');
 const payee=wht.slice(wht.indexOf('create table if not exists public.sc_wht_payees'),wht.indexOf('-- ── รายได้ค่าเช่าห้อง'));
 return `
 alter table sc_opex add column pay_method text,add column recorded_by text,add column last_updated timestamptz;
 create table sc_expense_categories(key text primary key,short_label text,is_active boolean default true);
 insert into sc_expense_categories values('admin_general','ดำเนินงาน & เบ็ดเตล็ด',true),('building_rent','ค่าเช่าอาคาร/สถานที่',true);
 alter table sc_expense_entries add column category text references sc_expense_categories(key),add column title text,add column pay_method text,add column legacy_opex_id bigint unique,add column created_by uuid;
 alter table sc_expense_entries add check(amount>0 and amount<10000000);
 create table sc_audit_logs(id bigint generated always as identity primary key,tenant_id uuid,action text,entity text,entity_id text,actor_id uuid,actor_name text,detail jsonb);
 create table sc_rental_records(id bigint generated always as identity primary key,tenant_id uuid,month text,income_amount numeric,tenant_name text,tenant_tax_id text,wht_rate numeric default 0,wht_withheld numeric default 0);
 alter table sc_rental_records enable row level security;
 ${payee}
 alter table sc_opex enable row level security;alter table sc_expense_entries enable row level security;
 alter table sc_wht_certificates enable row level security;alter table sc_wht_payees enable row level security;alter table sc_audit_logs enable row level security;alter table sc_expense_categories enable row level security;
 `;
}
