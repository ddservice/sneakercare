import * as XLSX from "xlsx";

export type SpreadsheetRow = Record<string, unknown>;
export type JsonSheet = { name: string; rows: readonly SpreadsheetRow[] };
export type MatrixSheet = { name: string; rows: readonly (readonly (string | number | boolean | null)[])[] };

function validSheetName(name: string): string {
  const cleaned = String(name || "Sheet").replace(/[\\/?*\[\]:]/g, " ").trim();
  return (cleaned || "Sheet").slice(0, 31);
}

export function downloadJsonWorkbook(fileName: string, sheets: readonly JsonSheet[]): void {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([...sheet.rows]),
      validSheetName(sheet.name)
    );
  }
  XLSX.writeFile(workbook, fileName);
}

export function downloadMatrixWorkbook(fileName: string, sheet: MatrixSheet): void {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(sheet.rows.map((row) => [...row])),
    validSheetName(sheet.name)
  );
  XLSX.writeFile(workbook, fileName);
}

export function parseFirstSheet(input: ArrayBuffer): {
  headers: string[];
  rows: SpreadsheetRow[];
} {
  const workbook = XLSX.read(input, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
  return {
    headers: (matrix[0] ?? []).map(String),
    rows: XLSX.utils.sheet_to_json<SpreadsheetRow>(sheet),
  };
}