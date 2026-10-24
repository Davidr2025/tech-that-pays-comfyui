/**
 * A small CSV reader (RFC 4180): comma-separated, double-quoted fields, "" for a quote inside quotes,
 * line breaks inside quotes, CRLF or LF, an optional byte-order mark. No dependency, and hard limits so a
 * hostile file cannot cost more than a few megabytes of work.
 */
export const CSV_LIMITS = { chars: 1_000_000, rows: 5_000, columns: 40, field: 5_000 } as const;

export class CsvError extends Error {}

export function parseCsv(input: string): string[][] {
  if (input.length > CSV_LIMITS.chars) throw new CsvError(`That file is too large. Keep it under ${CSV_LIMITS.chars.toLocaleString("en-US")} characters.`);
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldStarted = false;

  const endField = () => {
    if (field.length > CSV_LIMITS.field) throw new CsvError(`A cell is longer than ${CSV_LIMITS.field.toLocaleString("en-US")} characters, which is not a real lead. Check the file.`);
    row.push(field);
    field = "";
    fieldStarted = false;
    if (row.length > CSV_LIMITS.columns) throw new CsvError(`There are more than ${CSV_LIMITS.columns} columns. Check the file.`);
  };
  const endRow = () => {
    endField();
    // A completely empty line is not a record.
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
    if (rows.length > CSV_LIMITS.rows + 1) throw new CsvError(`Import at most ${CSV_LIMITS.rows.toLocaleString("en-US")} rows at a time.`);
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"' && !fieldStarted) {
      inQuotes = true;
      fieldStarted = true;
    } else if (ch === ",") endField();
    else if (ch === "\r") {
      if (text[i + 1] === "\n") i++;
      endRow();
    } else if (ch === "\n") endRow();
    else {
      field += ch;
      fieldStarted = true;
    }
  }
  if (inQuotes) throw new CsvError("A quoted cell is never closed. Check for a stray quotation mark.");
  if (fieldStarted || field !== "" || row.length > 0) endRow();
  return rows;
}
