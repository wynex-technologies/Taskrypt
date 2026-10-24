/** Minimal RFC 4180 CSV parser for previews (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string, maxRows = 200, maxCols = 30): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === '') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row.slice(0, maxCols));
      row = [];
      field = '';
      if (rows.length >= maxRows) return rows;
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row.slice(0, maxCols));
  }
  return rows;
}
