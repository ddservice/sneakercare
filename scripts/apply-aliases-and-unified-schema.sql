-- 1. Profiles columns update
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS branch_id uuid;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE profiles 
SET display_name = COALESCE(NULLIF(nickname, ''), NULLIF(fullname, ''), username, 'Admin') 
WHERE display_name IS NULL;

UPDATE profiles SET role = 'admin' WHERE username = 'admin';

-- 2. Create Aliases / Views for inv_ prefixed tables if non-prefixed tables do not exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'branches') THEN
    EXECUTE 'CREATE VIEW branches AS SELECT * FROM inv_branches;';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'items') THEN
    EXECUTE 'CREATE VIEW items AS SELECT * FROM inv_items;';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'item_stock') THEN
    EXECUTE 'CREATE VIEW item_stock AS SELECT * FROM inv_item_stock;';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'stock_transactions') THEN
    EXECUTE 'CREATE VIEW stock_transactions AS SELECT * FROM inv_stock_transactions;';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'audit_logs') THEN
    EXECUTE 'CREATE VIEW audit_logs AS SELECT * FROM inv_audit_logs;';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'suppliers') THEN
    EXECUTE 'CREATE VIEW suppliers AS SELECT * FROM inv_suppliers;';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'integration_secrets') THEN
    EXECUTE 'CREATE VIEW integration_secrets AS SELECT * FROM inv_integration_secrets;';
  END IF;
END $$;

-- 3. Views Aliases
CREATE OR REPLACE VIEW v_low_stock AS SELECT * FROM inv_v_low_stock;
CREATE OR REPLACE VIEW v_item_stock AS SELECT * FROM inv_v_item_stock;
CREATE OR REPLACE VIEW v_inventory_value AS SELECT * FROM inv_v_inventory_value;
CREATE OR REPLACE VIEW v_top_consumed_items_30d AS SELECT * FROM inv_v_top_consumed_items_30d;

-- 4. Unified POS and Expenses Tables (from 0008)
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  base_price numeric(10,2) NOT NULL DEFAULT 0,
  estimated_days integer NOT NULL DEFAULT 3,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no text UNIQUE NOT NULL,
  branch_id uuid,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  shoe_brand text,
  shoe_model text,
  shoe_color text,
  shoe_size text,
  total_amount numeric(10,2) NOT NULL DEFAULT 0,
  discount_amount numeric(10,2) NOT NULL DEFAULT 0,
  net_amount numeric(10,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'cash',
  payment_status text NOT NULL DEFAULT 'paid',
  status text NOT NULL DEFAULT 'received',
  note text,
  received_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  delivered_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  service_name text NOT NULL,
  price numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid,
  category text NOT NULL,
  title text NOT NULL,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  expense_date date NOT NULL DEFAULT current_date,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Seed Default Services if empty
INSERT INTO services (code, name, category, base_price, estimated_days)
VALUES
  ('SRV-BASIC', 'ทำความสะอาดทั่วไป (Basic Clean)', 'cleaning', 350.00, 3),
  ('SRV-DEEP', 'ทำความสะอาดละเอียดพิเศษ (Deep Clean)', 'cleaning', 650.00, 4),
  ('SRV-EXPRESS', 'บริการด่วนพิเศษ (Express Clean)', 'cleaning', 500.00, 1),
  ('SRV-UNYELLOW', 'ฟอกพื้นยางเหลือง (Unyellowing)', 'treatment', 400.00, 3),
  ('SRV-REPAINT', 'ทำสีรองเท้าเฉพาะจุด/ทั้งคู่ (Repaint)', 'repair', 1200.00, 7),
  ('SRV-SOLE-GLUE', 'ติดกาวพื้นรองเท้า (Sole Regluing)', 'repair', 450.00, 5),
  ('SRV-WATERPROOF', 'เคลือบสเปรย์กันน้ำระดับพรีเมียม', 'protection', 150.00, 1)
ON CONFLICT (code) DO NOTHING;

-- 6. Helper RPC function fn_integration_secret_status
CREATE OR REPLACE FUNCTION fn_integration_secret_status(p_key text)
RETURNS TABLE (
  is_set boolean,
  value_suffix text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    EXISTS (SELECT 1 FROM inv_integration_secrets WHERE key = p_key) AS is_set,
    SUBSTRING(value FROM GREATEST(1, LENGTH(value) - 3)) AS value_suffix,
    inv_integration_secrets.updated_at
  FROM inv_integration_secrets
  WHERE key = p_key;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text, NULL::timestamptz;
  END IF;
END;
$$;
