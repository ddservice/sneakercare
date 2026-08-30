DROP FUNCTION IF EXISTS extension_layer.fn_generate_document_number(character varying,character varying,character varying);

CREATE OR REPLACE FUNCTION extension_layer.fn_generate_document_number(
  p_doc_type VARCHAR(30),
  p_prefix VARCHAR(10),
  p_date_str VARCHAR(8)
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
