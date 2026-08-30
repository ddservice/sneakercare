-- ════════════════════════════════════════════════════════════════════════════
-- SmartAcc Enterprise Cloud — Phase 1 Extension Layer Schema
-- Isolated schema 'extension_layer' with zero core mutation
-- ════════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS extension_layer;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- 1. Numbering Sequences & System Config
CREATE TABLE IF NOT EXISTS extension_layer.ext_numbering_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type VARCHAR(30) NOT NULL, -- QUOTATION, DO, INVOICE, BILLING_NOTE, TAX_INVOICE, RECEIPT
  prefix VARCHAR(10) NOT NULL,
  year_month VARCHAR(6) NOT NULL, -- e.g. '202608'
  current_sequence INT NOT NULL DEFAULT 0,
  UNIQUE(doc_type, prefix, year_month)
);

-- 2. Default Thai Chart of Accounts Seed
CREATE TABLE IF NOT EXISTS extension_layer.ext_chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code VARCHAR(50) UNIQUE NOT NULL,
  account_name_th VARCHAR(255) NOT NULL,
  account_category VARCHAR(50) NOT NULL, -- ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
  default_wht_rate NUMERIC(4,2) DEFAULT 0.00,
  is_active BOOLEAN DEFAULT TRUE
);

-- 3. Contacts & Branches
CREATE TABLE IF NOT EXISTS extension_layer.ext_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_contact_id VARCHAR(100) UNIQUE,
  tax_id VARCHAR(13),
  branch_code VARCHAR(5) DEFAULT '00000',
  company_name VARCHAR(255) NOT NULL,
  address TEXT,
  phone VARCHAR(50),
  email VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS extension_layer.ext_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  address TEXT,
  is_active BOOLEAN DEFAULT TRUE
);

-- 4. Inventory & Multi-Branch Stock
CREATE TABLE IF NOT EXISTS extension_layer.ext_inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  unit VARCHAR(50) DEFAULT 'unit',
  cost_price NUMERIC(12,2) DEFAULT 0.00,
  selling_price NUMERIC(12,2) DEFAULT 0.00,
  min_stock_alert NUMERIC(10,2) DEFAULT 5.00,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS extension_layer.ext_branch_stocks (
  branch_id UUID REFERENCES extension_layer.ext_branches(id),
  item_id UUID REFERENCES extension_layer.ext_inventory_items(id),
  quantity NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (branch_id, item_id)
);

-- 5. Staged Documents & Line Items
CREATE TABLE IF NOT EXISTS extension_layer.ext_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type VARCHAR(30) NOT NULL,
  doc_number VARCHAR(50) UNIQUE NOT NULL,
  contact_id UUID REFERENCES extension_layer.ext_contacts(id),
  branch_id UUID REFERENCES extension_layer.ext_branches(id),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  credit_term_days INT DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  subtotal_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  discount_amount NUMERIC(12,2) DEFAULT 0.00,
  vat_rate NUMERIC(4,2) DEFAULT 7.00,
  vat_amount NUMERIC(12,2) DEFAULT 0.00,
  wht_rate NUMERIC(4,2) DEFAULT 0.00,
  wht_amount NUMERIC(12,2) DEFAULT 0.00,
  grand_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  promptpay_payload TEXT,
  share_token VARCHAR(100) UNIQUE,
  notes TEXT,
  payment_details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS extension_layer.ext_document_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES extension_layer.ext_documents(id) ON DELETE CASCADE,
  item_id UUID REFERENCES extension_layer.ext_inventory_items(id),
  item_name VARCHAR(255) NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1.00,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  discount NUMERIC(12,2) DEFAULT 0.00,
  total_line_amount NUMERIC(12,2) NOT NULL,
  sort_order INT DEFAULT 0
);

-- 6. Billing Note DO Cross-References
CREATE TABLE IF NOT EXISTS extension_layer.ext_billing_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_note_id UUID REFERENCES extension_layer.ext_documents(id) ON DELETE CASCADE,
  ref_doc_id UUID REFERENCES extension_layer.ext_documents(id),
  ref_doc_type VARCHAR(30) NOT NULL, -- DO, INVOICE
  ref_doc_number VARCHAR(50) NOT NULL,
  ref_date DATE NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL,
  paid_amount NUMERIC(12,2) DEFAULT 0.00,
  balance_due NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Bank Slips, OCR Expenses & e-Tax
CREATE TABLE IF NOT EXISTS extension_layer.ext_slip_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES extension_layer.ext_documents(id),
  bank_trans_ref VARCHAR(100) UNIQUE NOT NULL,
  sending_bank VARCHAR(20),
  receiving_bank VARCHAR(20),
  trans_date TIMESTAMPTZ NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  slip_image_url TEXT,
  verification_status VARCHAR(30) DEFAULT 'VERIFIED',
  raw_payload JSONB,
  verified_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS extension_layer.ext_staged_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_image_url TEXT NOT NULL,
  extracted_vendor_name VARCHAR(255),
  extracted_tax_id VARCHAR(13),
  extracted_date DATE,
  subtotal NUMERIC(12,2) DEFAULT 0.00,
  vat_amount NUMERIC(12,2) DEFAULT 0.00,
  wht_amount NUMERIC(12,2) DEFAULT 0.00,
  total_amount NUMERIC(12,2) NOT NULL,
  suggested_account_code VARCHAR(50) REFERENCES extension_layer.ext_chart_of_accounts(account_code),
  approval_status VARCHAR(30) DEFAULT 'PENDING_APPROVAL',
  raw_ocr_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS extension_layer.ext_etax_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES extension_layer.ext_documents(id) ON DELETE CASCADE,
  doc_type_code VARCHAR(10) NOT NULL,
  submission_mode VARCHAR(20) NOT NULL,
  xml_payload TEXT NOT NULL,
  signed_xml_hash VARCHAR(64),
  pdf_a3_url TEXT,
  recipient_email VARCHAR(100),
  rd_status VARCHAR(30) DEFAULT 'PENDING',
  rd_transaction_id VARCHAR(100),
  rd_error_message TEXT,
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Tax Reporting (WHT / 50 Tawi & VAT PP.30)
CREATE TABLE IF NOT EXISTS extension_layer.ext_wht_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES extension_layer.ext_documents(id),
  form_type VARCHAR(10) NOT NULL, -- PND3 or PND53
  vendor_tax_id VARCHAR(13) NOT NULL,
  vendor_name VARCHAR(255) NOT NULL,
  vendor_address TEXT,
  income_type_code VARCHAR(20) NOT NULL,
  payment_date DATE NOT NULL,
  base_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  wht_rate NUMERIC(4,2) NOT NULL DEFAULT 3.00,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  certificate_number VARCHAR(50) UNIQUE NOT NULL,
  pdf_certificate_url TEXT,
  filing_status VARCHAR(20) DEFAULT 'UNFILED',
  tax_period_month INT NOT NULL,
  tax_period_year INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS extension_layer.ext_vat_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vat_type VARCHAR(10) NOT NULL, -- SALES or PURCHASE
  invoice_number VARCHAR(50) NOT NULL,
  invoice_date DATE NOT NULL,
  partner_tax_id VARCHAR(13) NOT NULL,
  partner_branch_code VARCHAR(5) DEFAULT '00000',
  partner_name VARCHAR(255) NOT NULL,
  base_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  tax_period_month INT NOT NULL,
  tax_period_year INT NOT NULL,
  is_claimable BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. AI Vector Store & LINE OA Integration
CREATE TABLE IF NOT EXISTS extension_layer.ext_ai_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_entity VARCHAR(50),
  entity_id UUID,
  content_chunk TEXT NOT NULL,
  embedding vector(1536),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS extension_layer.ext_line_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id VARCHAR(100) UNIQUE NOT NULL,
  account_type VARCHAR(20) NOT NULL,
  contact_id UUID REFERENCES extension_layer.ext_contacts(id),
  display_name VARCHAR(255),
  picture_url TEXT,
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS extension_layer.ext_line_notifications_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id VARCHAR(100) NOT NULL,
  notification_type VARCHAR(50) NOT NULL,
  reference_document_id UUID REFERENCES extension_layer.ext_documents(id),
  status VARCHAR(20) DEFAULT 'SENT',
  line_message_id VARCHAR(100),
  payload JSONB,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Initial Seed Data (Thai Chart of Accounts Essentials)
INSERT INTO extension_layer.ext_chart_of_accounts (account_code, account_name_th, account_category, default_wht_rate) VALUES
('510100', 'ค่าเช่าสำนักงานและอาคาร', 'EXPENSE', 5.00),
('510200', 'ค่าบริการวิชาชีพและที่ปรึกษา', 'EXPENSE', 3.00),
('510300', 'ค่าจ้างทำของและบริการทั่วไป', 'EXPENSE', 3.00),
('510400', 'ค่าขนส่งและโลจิสติกส์', 'EXPENSE', 1.00),
('510500', 'ค่าโฆษณาและการตลาด', 'EXPENSE', 2.00),
('510600', 'ค่าน้ำมันและเชื้อเพลิง', 'EXPENSE', 0.00),
('510700', 'ค่าสาธารณูปโภค (ค่าน้ำ-ค่าไฟ-อินเทอร์เน็ต)', 'EXPENSE', 0.00),
('510800', 'ค่าอุปกรณ์และเครื่องใช้สำนักงาน', 'EXPENSE', 0.00)
ON CONFLICT (account_code) DO NOTHING;

-- 11. Atomic Document Numbering Function
CREATE OR REPLACE FUNCTION extension_layer.fn_generate_document_number(
  p_doc_type VARCHAR(30),
  p_prefix VARCHAR(10),
  p_year_month VARCHAR(6)
)
RETURNS VARCHAR(50)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_seq INT;
  v_doc_number VARCHAR(50);
BEGIN
  INSERT INTO extension_layer.ext_numbering_sequences (doc_type, prefix, year_month, current_sequence)
  VALUES (p_doc_type, p_prefix, p_year_month, 1)
  ON CONFLICT (doc_type, prefix, year_month)
  DO UPDATE SET current_sequence = extension_layer.ext_numbering_sequences.current_sequence + 1
  RETURNING current_sequence INTO v_seq;

  v_doc_number := p_prefix || '-' || p_year_month || '-' || LPAD(v_seq::text, 4, '0');
  RETURN v_doc_number;
END;
$$;

-- 12. Permissions and Grants
GRANT USAGE ON SCHEMA extension_layer TO authenticated, anon, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA extension_layer TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA extension_layer TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA extension_layer TO authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA extension_layer TO authenticated, service_role;
