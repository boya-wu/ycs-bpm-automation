import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

import type { PmWorkItemBatch, PmWorkItemRow } from './pm-work-item';

export const DEFAULT_PM_WORK_ITEMS_XLSX = path.join(__dirname, '..', 'docs', 'PM', 'pm-work-items - Iris.xlsx');


const DATA_SHEET_NAMES = ['批次', 'WorkItems', '工作項目'] as const;
const SKIP_SHEET_NAMES = new Set(['說明', 'README', '範例說明']);

type ParsedRow = {
  projectCode: string;
  pmEmpId: string;
  num: string;
  name: string;
  hour: string;
  alarmHour: string;
};

function cellStr(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(value);
  }
  return String(value).trim();
}

function normalizeHeader(header: string): string {
  return header.replace(/\s+/g, '').trim().toLowerCase();
}

const HEADER_MAP: Record<string, keyof Omit<ParsedRow, never>> = {
  專案代號: 'projectCode',
  專案: 'projectCode',
  projectcode: 'projectCode',
  py: 'projectCode',
  pm工號: 'pmEmpId',
  pmempid: 'pmEmpId',
  empid: 'pmEmpId',
  新增人員工號: 'pmEmpId',
  序號: 'num',
  num: 'num',
  工作項目名稱: 'name',
  工作項目: 'name',
  name: 'name',
  預估工時: 'hour',
  hour: 'hour',
  警示工時: 'alarmHour',
  alarmhour: 'alarmHour',
};

function isHeaderRow(cells: string[]): boolean {
  const joined = cells.join('');
  if (!joined) return false;
  return cells.some((c) => {
    const key = normalizeHeader(c);
    return key in HEADER_MAP;
  });
}

function mapHeaders(headerRow: string[]): Partial<Record<keyof ParsedRow, number>> {
  const index: Partial<Record<keyof ParsedRow, number>> = {};
  headerRow.forEach((raw, i) => {
    const field = HEADER_MAP[normalizeHeader(raw)];
    if (field) index[field] = i;
  });
  return index;
}

function rowFromArray(cells: string[], index: Partial<Record<keyof ParsedRow, number>>): ParsedRow | null {
  const pick = (field: keyof ParsedRow) => {
    const col = index[field];
    return col == null ? '' : cellStr(cells[col]);
  };

  const row: ParsedRow = {
    projectCode: pick('projectCode'),
    pmEmpId: pick('pmEmpId'),
    num: pick('num'),
    name: pick('name'),
    hour: pick('hour'),
    alarmHour: pick('alarmHour'),
  };

  if (!row.num && !row.name && !row.hour && !row.alarmHour) return null;
  if (!row.num || !row.name) {
    throw new Error(`WorkItem 列缺少序號或名稱：${JSON.stringify(row)}`);
  }
  return row;
}

function parseSheetRows(matrix: string[][]): ParsedRow[] {
  const dataRows = matrix.filter((r) => r.some((c) => cellStr(c)));
  if (dataRows.length === 0) return [];

  let start = 0;
  let index: Partial<Record<keyof ParsedRow, number>> = {};

  if (isHeaderRow(dataRows[0].map(cellStr))) {
    index = mapHeaders(dataRows[0].map(cellStr));
    start = 1;
  } else {
    index = { num: 0, name: 1, hour: 2, alarmHour: 3 };
  }

  const hasProjectCols = index.projectCode != null || index.pmEmpId != null;
  const out: ParsedRow[] = [];

  for (let i = start; i < dataRows.length; i++) {
    const cells = dataRows[i].map(cellStr);
    if (isHeaderRow(cells)) continue;
    const row = rowFromArray(cells, index);
    if (!row) continue;

    if (!hasProjectCols) {
      row.projectCode = '';
      row.pmEmpId = '';
    }
    out.push(row);
  }

  return out;
}

function groupIntoBatches(rows: ParsedRow[]): PmWorkItemBatch[] {
  const batches = new Map<string, PmWorkItemBatch>();

  for (const row of rows) {
    const key = `${row.projectCode}\t${row.pmEmpId}`;
    let batch = batches.get(key);
    if (!batch) {
      batch = {
        projectCode: row.projectCode,
        pmEmpId: row.pmEmpId,
        workItems: [],
      };
      batches.set(key, batch);
    }
    const item: PmWorkItemRow = {
      num: row.num,
      name: row.name,
      hour: row.hour || '0',
      alarmHour: row.alarmHour || row.hour || '0',
    };
    (batch.workItems as PmWorkItemRow[]).push(item);
  }

  return [...batches.values()].map((b) => ({
    ...b,
    workItems: b.workItems as readonly PmWorkItemRow[],
  }));
}

function readMatrixFromWorkbook(filePath: string): string[][] {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`找不到 Excel：${resolved}`);
  }

  const workbook = XLSX.readFile(resolved, { cellDates: false });
  const sheetName =
    DATA_SHEET_NAMES.find((n) => workbook.SheetNames.includes(n)) ??
    workbook.SheetNames.find((n) => !SKIP_SHEET_NAMES.has(n));

  if (!sheetName) {
    throw new Error(`Excel 內無可讀取的工作表：${resolved}`);
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as string[][];

  return matrix;
}

/** 讀取 Excel，依「專案代號 + PM工號」分組為多筆批次 */
export function loadPmWorkItemBatchesFromExcel(filePath: string): readonly PmWorkItemBatch[] {
  const rows = parseSheetRows(readMatrixFromWorkbook(filePath));
  if (rows.length === 0) {
    throw new Error(`Excel 無有效資料列：${path.resolve(filePath)}`);
  }
  return groupIntoBatches(rows);
}

/** 讀取 Excel 中所有 WorkItem（扁平清單；單一專案時使用） */
export function loadPmWorkItemsFromExcel(filePath: string): readonly PmWorkItemRow[] {
  const batches = loadPmWorkItemBatchesFromExcel(filePath);
  if (batches.length !== 1) {
    throw new Error(
      `Excel 含 ${batches.length} 組專案，請改用 loadPmWorkItemBatchesFromExcel 做批次匯入`,
    );
  }
  return batches[0].workItems;
}
