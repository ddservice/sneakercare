-- ============================================================
--  SneakerCare — Supabase Setup v2
--  รันใน Supabase SQL Editor ก่อนใช้ Dashboard ใหม่
-- ============================================================

-- 1. เพิ่ม column ที่ขาดไปใน sc_stock_status
ALTER TABLE sc_stock_status ADD COLUMN IF NOT EXISTS category  text    DEFAULT '';
ALTER TABLE sc_stock_status ADD COLUMN IF NOT EXISTS last_price numeric(12,4) DEFAULT 0;
ALTER TABLE sc_stock_status ADD COLUMN IF NOT EXISTS min_alert integer  DEFAULT 10;

-- 2. สร้าง sc_users (profiles) table เชื่อมกับ auth.users
CREATE TABLE IF NOT EXISTS sc_users (
  id         bigserial  PRIMARY KEY,
  user_id    uuid       REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  username   text       NOT NULL UNIQUE,
  fullname   text       DEFAULT '',
  nickname   text       DEFAULT '',
  role       text       DEFAULT 'staff',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sc_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_users" ON sc_users;
CREATE POLICY "auth_all_users" ON sc_users
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Seed sc_users สำหรับผู้ใช้ที่มีอยู่ใน Auth
INSERT INTO sc_users (user_id, username, fullname, nickname, role)
SELECT id, 'admin', 'ผู้ดูแลระบบ', 'Admin', 'admin'
FROM auth.users WHERE email = 'admin@ddserviceth.com'
ON CONFLICT (username) DO UPDATE SET
  user_id  = EXCLUDED.user_id,
  fullname = EXCLUDED.fullname,
  nickname = EXCLUDED.nickname,
  role     = EXCLUDED.role;

INSERT INTO sc_users (user_id, username, fullname, nickname, role)
SELECT id, 'milo', 'Milo', 'Milo', 'staff'
FROM auth.users WHERE email = 'milo@ddserviceth.com'
ON CONFLICT (username) DO UPDATE SET
  user_id  = EXCLUDED.user_id,
  fullname = EXCLUDED.fullname,
  nickname = EXCLUDED.nickname,
  role     = EXCLUDED.role;

-- 4. Grant execute on RPCs (ถ้าใช้งาน)
-- ไม่มี RPC ในเวอร์ชันนี้ ใช้ client-side query แทน

-- ตรวจสอบผลลัพธ์
SELECT username, role, fullname FROM sc_users;
