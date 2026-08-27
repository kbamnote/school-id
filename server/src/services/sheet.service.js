const ExcelJS = require('exceljs');
const ApiError = require('../utils/ApiError');

const MAX_IMPORT_ROWS = 5000;

/**
 * Minimal RFC-4180 CSV parser.
 *
 * Written by hand rather than pulled from a dependency because the rules that
 * matter here are narrow and well defined: quoted fields may contain commas,
 * newlines and escaped quotes. A naive `split(',')` corrupts exactly the rows
 * an operator is least likely to notice - names with commas.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  // Strip a UTF-8 BOM, which Excel adds and which would otherwise become part
  // of the first header name.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ''));
}

/** Converts a cell to a plain string, handling ExcelJS rich text and formulas. */
function cellToString(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if (value.text) return String(value.text);
    if (value.result !== undefined) return String(value.result);
    if (Array.isArray(value.richText)) return value.richText.map((t) => t.text).join('');
    if (value.hyperlink) return String(value.text || value.hyperlink);
    return '';
  }
  return String(value);
}

async function parseXlsx(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw ApiError.badRequest('That spreadsheet has no sheets.');

  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (excelRow) => {
    const values = [];
    // ExcelJS row values are 1-indexed with a leading hole at [0].
    excelRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      values[colNumber - 1] = cellToString(cell.value);
    });
    for (let i = 0; i < values.length; i += 1) {
      if (values[i] === undefined) values[i] = '';
    }
    if (values.some((v) => String(v).trim() !== '')) rows.push(values);
  });

  return rows;
}

/**
 * Parses an uploaded sheet into `{ headers, rows }` where each row is an
 * object keyed by header name.
 */
async function parseSheet(file) {
  const isCsv =
    file.mimetype === 'text/csv' || /\.csv$/i.test(file.originalname || '');

  const matrix = isCsv
    ? parseCsv(file.buffer.toString('utf8'))
    : await parseXlsx(file.buffer);

  if (!matrix.length) throw ApiError.badRequest('That file appears to be empty.');

  const [headerRow, ...dataRows] = matrix;
  const headers = headerRow.map((h, i) => String(h || '').trim() || `Column ${i + 1}`);

  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw ApiError.badRequest(
      `That file has ${dataRows.length} rows. Please split it into files of ${MAX_IMPORT_ROWS} rows or fewer.`,
      { code: 'TOO_MANY_ROWS', details: { rows: dataRows.length, max: MAX_IMPORT_ROWS } }
    );
  }

  const rows = dataRows.map((cells) => {
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = cells[i] === undefined ? '' : cells[i];
    });
    return obj;
  });

  return { headers, rows };
}

/** Builds an .xlsx buffer from a column definition and rows. */
async function buildXlsx(columns, rows, sheetName = 'Sheet1') {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MR Print World';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width || Math.max(14, c.header.length + 4),
  }));

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFEEF4FF' },
  };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  rows.forEach((row) => sheet.addRow(row));

  return workbook.xlsx.writeBuffer();
}

/** CSV output with correct quoting - the inverse of parseCsv. */
function buildCsv(columns, rows) {
  const escape = (value) => {
    const str = value === null || value === undefined ? '' : String(value);
    return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const lines = [columns.map((c) => escape(c.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => escape(row[c.key])).join(','));
  }
  // BOM so Excel opens UTF-8 names correctly instead of mangling them.
  return `﻿${lines.join('\r\n')}`;
}

module.exports = { parseSheet, parseCsv, buildXlsx, buildCsv, MAX_IMPORT_ROWS };
