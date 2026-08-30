-- ============================================================================
-- Migration: 0010_smartacc_performance_indexes.sql
-- Description: Composite indexes for high-speed document queries & DBD lookups
-- Schema: extension_layer
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_ext_documents_type_status_date 
  ON extension_layer.ext_documents (doc_type, status, issue_date DESC);

CREATE INDEX IF NOT EXISTS idx_ext_document_items_doc_id 
  ON extension_layer.ext_document_items (document_id);

CREATE INDEX IF NOT EXISTS idx_ext_contacts_tax_name 
  ON extension_layer.ext_contacts (tax_id, company_name);

CREATE INDEX IF NOT EXISTS idx_ext_staged_expenses_approval 
  ON extension_layer.ext_staged_expenses (approval_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ext_slip_trans_ref 
  ON extension_layer.ext_slip_verifications (bank_trans_ref);
