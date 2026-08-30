-- 1. Add Parent Document Reference to ext_documents for Conversion Pipeline
ALTER TABLE extension_layer.ext_documents 
ADD COLUMN IF NOT EXISTS ref_parent_doc_id UUID REFERENCES extension_layer.ext_documents(id) ON DELETE SET NULL;

ALTER TABLE extension_layer.ext_documents 
ADD COLUMN IF NOT EXISTS ref_parent_doc_number VARCHAR(50);

-- 2. Update Document Numbering Sequences to support YYYYMMDD
ALTER TABLE extension_layer.ext_numbering_sequences
ALTER COLUMN year_month TYPE VARCHAR(8); -- accommodate YYYYMMDD

-- 3. Update fn_generate_document_number for standard YYYYMMDD atomic running numbering
CREATE OR REPLACE FUNCTION extension_layer.fn_generate_document_number(
  p_doc_type VARCHAR(30),
  p_prefix VARCHAR(10),
  p_date_str VARCHAR(8) -- e.g. '20260830'
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
  VALUES (p_doc_type, p_prefix, p_date_str, 1)
  ON CONFLICT (doc_type, prefix, year_month)
  DO UPDATE SET current_sequence = extension_layer.ext_numbering_sequences.current_sequence + 1
  RETURNING current_sequence INTO v_seq;

  v_doc_number := p_prefix || '-' || p_date_str || '-' || LPAD(v_seq::text, 4, '0');
  RETURN v_doc_number;
END;
$$;

-- 4. Clean up any dummy test data in extension_layer
DELETE FROM extension_layer.ext_document_items;
DELETE FROM extension_layer.ext_billing_references;
DELETE FROM extension_layer.ext_slip_verifications;
DELETE FROM extension_layer.ext_staged_expenses;
DELETE FROM extension_layer.ext_etax_logs;
DELETE FROM extension_layer.ext_wht_records;
DELETE FROM extension_layer.ext_vat_transactions;
DELETE FROM extension_layer.ext_documents;
