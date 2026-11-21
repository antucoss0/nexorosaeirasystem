import ExcelJS from "exceljs";
import { tabular } from "./impact-model";
export function validateWorkbookBudget(bytes: Buffer) {
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0 || end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length)
    throw Error("XLSX inválido");
  const count = bytes.readUInt16LE(end + 10),
    offset = bytes.readUInt32LE(end + 16),
    size = bytes.readUInt32LE(end + 12);
  if (
    bytes.readUInt16LE(end + 4) ||
    bytes.readUInt16LE(end + 6) ||
    count > 1000 ||
    offset + size > end
  )
    throw Error("Libro multipartes, ZIP64 o demasiado grande");
  let cursor = offset,
    total = 0;
  for (let n = 0; n < count; n++) {
    if (cursor + 46 > bytes.length || bytes.readUInt32LE(cursor) !== 0x02014b50)
      throw Error("Directorio XLSX inválido");
    total += bytes.readUInt32LE(cursor + 24);
    if (total > 20 * 1024 * 1024 || bytes.readUInt16LE(cursor + 8) & 1)
      throw Error("XLSX cifrado o descomprimido mayor de 20 MB");
    cursor +=
      46 +
      bytes.readUInt16LE(cursor + 28) +
      bytes.readUInt16LE(cursor + 30) +
      bytes.readUInt16LE(cursor + 32);
  }
  if (cursor !== offset + size) throw Error("Directorio XLSX inconsistente");
}
export async function readWorkbook(bytes: Buffer) {
  validateWorkbookBudget(bytes);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as any);
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount > 2001 || sheet.columnCount > 60)
    throw Error("Libro vacío o excede 2000 filas / 60 columnas");
  const rows: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, (r) => {
    const cells: unknown[] = [];
    for (let n = 1; n <= sheet.columnCount; n++) {
      const c = r.getCell(n);
      cells.push(
        c.value instanceof Date ? c.value.toISOString().slice(0, 10) : c.text,
      );
    }
    rows.push(cells);
  });
  return tabular(rows);
}
