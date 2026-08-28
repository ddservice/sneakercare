-- ════════════════════════════════════════════════════════════════════════
--  0008_unified_pos_and_expenses.sql
--  ระบบงานบริการ/ยอดขาย (POS), ลูกค้า, ค่าใช้จ่าย (Opex), และบริการเสริม
-- ════════════════════════════════════════════════════════════════════════

-- ── CUSTOMERS ─────────────────────────────────────────────────────────────
create table if not exists customers (
  id           uuid primary key default gen_random_uuid(),
  phone        text not null,
  name         text not null,
  note         text,
  branch_id    uuid references branches(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_customers_phone on customers(phone);
create index if not exists idx_customers_branch on customers(branch_id);

-- ── SERVICES MASTER (รายการบริการและราคามาตรฐาน) ─────────────────────────
create table if not exists services (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  category     text not null default 'cleaning', -- cleaning, repair, repaint, treatment, extra
  base_price   numeric(10,2) not null default 0,
  description  text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ── ORDERS / SERVICE JOBS (รายการรับงานซัก/ซ่อม) ─────────────────────────
do $$ begin
  create type order_status as enum ('received', 'in_progress', 'ready', 'delivered', 'cancelled');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type payment_method as enum ('cash', 'transfer', 'credit', 'unpaid');
exception
  when duplicate_object then null;
end $$;

create table if not exists service_orders (
  id               uuid primary key default gen_random_uuid(),
  order_no         text unique not null,
  branch_id        uuid references branches(id),
  customer_id      uuid references customers(id),
  customer_name    text not null,
  customer_phone   text not null,
  shoe_brand       text,
  shoe_model       text,
  shoe_color       text,
  shoe_size        text default 'M',
  status           order_status not null default 'received',
  payment_method   payment_method not null default 'cash',
  gross_amount     numeric(10,2) not null default 0,
  discount_amount  numeric(10,2) not null default 0,
  net_amount       numeric(10,2) not null default 0,
  cash_amount      numeric(10,2) not null default 0,
  transfer_amount  numeric(10,2) not null default 0,
  is_paid          boolean not null default true,
  notes            text,
  received_by      uuid references profiles(id),
  received_at      timestamptz not null default now(),
  completed_at     timestamptz,
  delivered_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_orders_branch on service_orders(branch_id);
create index if not exists idx_orders_status on service_orders(status);
create index if not exists idx_orders_date on service_orders(received_at);

-- ── ORDER ITEMS (รายการบริการย่อยในแต่ละออเดอร์) ──────────────────────────
create table if not exists service_order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references service_orders(id) on delete cascade,
  service_id       uuid references services(id),
  service_name     text not null,
  price            numeric(10,2) not null default 0,
  quantity         integer not null default 1,
  created_at       timestamptz not null default now()
);

-- ── EXPENSES (ค่าใช้จ่ายร้าน & Opex) ────────────────────────────────────
create table if not exists expenses (
  id               uuid primary key default gen_random_uuid(),
  branch_id        uuid references branches(id),
  category         text not null, -- rent, utilities, supplies, marketing, salary, sso, other
  title            text not null,
  amount           numeric(10,2) not null default 0,
  expense_date     date not null default current_date,
  note             text,
  created_by       uuid references profiles(id),
  created_at       timestamptz not null default now()
);

create index if not exists idx_expenses_branch on expenses(branch_id);
create index if not exists idx_expenses_date on expenses(expense_date);

-- ── ROW LEVEL SECURITY (RLS) ─────────────────────────────────────────────
alter table customers enable row level security;
alter table services enable row level security;
alter table service_orders enable row level security;
alter table service_order_items enable row level security;
alter table expenses enable row level security;

-- Policies for services (ทุกคนอ่านได้, Admin แก้ไขได้)
create policy "services_select_all" on services
  for select using (true);

create policy "services_modify_admin" on services
  for all using (fn_current_role() = 'admin');

-- Policies for customers & orders
create policy "customers_all_authenticated" on customers
  for all using (auth.role() = 'authenticated');

create policy "orders_all_authenticated" on service_orders
  for all using (auth.role() = 'authenticated');

create policy "order_items_all_authenticated" on service_order_items
  for all using (auth.role() = 'authenticated');

create policy "expenses_all_authenticated" on expenses
  for all using (auth.role() = 'authenticated');
