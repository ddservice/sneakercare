import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
export const uuid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
export const ids={tenant:uuid(1),other:uuid(2),branch:uuid(3),otherBranch:uuid(4),admin:uuid(5),staff:uuid(6),co:uuid(7),superAdmin:uuid(8),service:uuid(9)};
export async function fixture(migrations=['0046_receipt_posts_and_live_guards.sql','0048_security_boundaries.sql','0049_atomic_sales_and_payments.sql']){
 const db=new PGlite();
 await db.exec(fixtureSql());
 for(const m of migrations) await db.exec(fs.readFileSync(`supabase/migrations/${m}`,'utf8'));
 return db;
}
export function fixtureSql(){const i=ids; return `
 create role anon; create role authenticated; create role service_role;
 create schema auth; create schema extension_layer;
 create function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
 grant usage on schema auth,public,extension_layer to authenticated,anon,service_role;
 create table tenants(id uuid primary key,name text); insert into tenants values('${i.tenant}','A'),('${i.other}','B');
 create table branches(id uuid primary key,tenant_id uuid references tenants(id),name text,is_active boolean default true,vat_registered boolean default false);
 insert into branches values('${i.branch}','${i.tenant}','A',true,true),('${i.otherBranch}','${i.other}','B',true,false);
 create table profiles(id uuid primary key,role text,tenant_id uuid,branch_id uuid,is_active boolean default true,display_name text,username text);
 insert into profiles values('${i.admin}','admin','${i.tenant}',null,true,'Admin','admin'),('${i.staff}','staff','${i.tenant}','${i.branch}',true,'Staff','staff'),('${i.co}','co-admin','${i.tenant}','${i.branch}',true,'Co','co'),('${i.superAdmin}','super_admin',null,null,true,'Super','super');
 create function sc_get_my_role() returns text language sql stable security definer set search_path=public as $$select role from profiles where id=auth.uid() and is_active$$;
 create function inv_fn_current_role() returns text language sql stable security definer set search_path=public as $$select role from profiles where id=auth.uid() and is_active$$;
 create function inv_fn_current_branch() returns uuid language sql stable security definer set search_path=public as $$select branch_id from profiles where id=auth.uid() and is_active$$;
 create function fn_current_tenant() returns uuid language sql stable security definer set search_path=public as $$select tenant_id from profiles where id=auth.uid() and is_active$$;
 create table items(id uuid primary key,tenant_id uuid,is_active boolean default true);
 create table sc_settings(tenant_id uuid,key text,value text,updated_at timestamptz,primary key(tenant_id,key));
 create table services(id uuid primary key default gen_random_uuid(),tenant_id uuid,name text,is_active boolean default true,base_price numeric default 0);
 insert into services values('${i.service}','${i.tenant}','clean',true,200);
 create table customers(id uuid primary key default gen_random_uuid(),tenant_id uuid,name text,phone text,updated_at timestamptz default now());
 create table service_orders(id uuid primary key default gen_random_uuid(),tenant_id uuid,branch_id uuid,customer_id uuid references customers(id),order_no text unique,customer_name text,customer_phone text,shoe_brand text,shoe_model text,shoe_color text,shoe_size text,total_amount numeric(10,2) default 0,discount_amount numeric default 0,net_amount numeric default 0,payment_method text,payment_status text,status text,note text,created_by uuid,received_at timestamptz,cash_amount numeric,transfer_amount numeric,updated_at timestamptz default now(),completed_at timestamptz,delivered_at timestamptz);
 create table service_order_items(id uuid primary key default gen_random_uuid(),tenant_id uuid,order_id uuid references service_orders(id),service_id uuid references services(id),service_name text,price numeric,quantity integer);
 create table sc_sales(id bigint generated always as identity primary key,tenant_id uuid not null,date date not null,size_s integer default 0,size_m integer default 0,size_l integer default 0,size_xl integer default 0,grand_total numeric default 0,discount numeric default 0,total_revenue numeric default 0,cash_amount numeric default 0,transfer_amount numeric default 0,amount_paid numeric default 0,payment_status text,extra_items text,recorded_by text,last_updated timestamptz,client_request_id uuid,service_order_id uuid references service_orders(id),created_at timestamptz default now(),unique(tenant_id,client_request_id));
 create table sc_payments(id bigint generated always as identity primary key,tenant_id uuid not null,sale_date date not null,received_date date not null,amount numeric,pay_method text,notes text,recorded_by text,client_request_id uuid,created_at timestamptz default now(),unique(tenant_id,client_request_id));
 create table sc_opex(id bigint generated always as identity primary key,tenant_id uuid,month text,amount numeric,category text,key text,name text);
 create table sc_expense_entries(id bigint generated always as identity primary key,tenant_id uuid,entry_date date,amount numeric);
 create table extension_layer.ext_contacts(id uuid primary key default gen_random_uuid(),tenant_id uuid,company_name text,tax_id text,branch_code text,address text,phone text,email text);
 create table extension_layer.ext_numbering_sequences(tenant_id uuid,doc_type varchar,prefix varchar,year_month varchar,current_sequence integer,unique(tenant_id,doc_type,prefix,year_month));
 create table extension_layer.ext_documents(id uuid primary key default gen_random_uuid(),tenant_id uuid,branch_id uuid,doc_type varchar(30),doc_number varchar(50),contact_id uuid references extension_layer.ext_contacts(id),issue_date date,due_date date,credit_term_days integer,status varchar(30),subtotal_amount numeric(12,2),discount_amount numeric(12,2) default 0,vat_rate numeric(4,2),vat_amount numeric(12,2),grand_total numeric(12,2),promptpay_payload text,share_token varchar(100),notes text,ref_parent_doc_id uuid references extension_layer.ext_documents(id),ref_parent_doc_number varchar(50),created_at timestamptz default now(),unique(tenant_id,doc_number));
 create table extension_layer.ext_document_items(id uuid primary key default gen_random_uuid(),tenant_id uuid,document_id uuid references extension_layer.ext_documents(id),item_name text,quantity numeric(12,3),unit_price numeric(12,2),discount numeric(12,2),total_line_amount numeric(12,2),sort_order integer);
 create table extension_layer.ext_billing_references(id uuid primary key default gen_random_uuid(),tenant_id uuid,billing_note_id uuid references extension_layer.ext_documents(id),ref_doc_id uuid references extension_layer.ext_documents(id),ref_doc_type text,ref_doc_number text,ref_date date,total_amount numeric,balance_due numeric);
 create function extension_layer.fn_generate_document_number(p_doc_type varchar,p_prefix varchar,p_date_str varchar,p_tenant_id uuid) returns varchar language plpgsql security definer set search_path=extension_layer as $$declare s integer; begin insert into ext_numbering_sequences values(p_tenant_id,p_doc_type,p_prefix,p_date_str,1) on conflict(tenant_id,doc_type,prefix,year_month) do update set current_sequence=ext_numbering_sequences.current_sequence+1 returning current_sequence into s; return p_prefix||'-'||p_date_str||'-'||lpad(s::text,4,'0');end$$;
 alter table profiles enable row level security;
 alter table sc_settings enable row level security;
 alter table services enable row level security;
 alter table customers enable row level security;
 alter table service_orders enable row level security;
 alter table service_order_items enable row level security;
 alter table sc_sales enable row level security;
 alter table sc_payments enable row level security;
 `;
}
export async function serviceRole(db){await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claims','{"role":"service_role"}',false);set role service_role;`);}
