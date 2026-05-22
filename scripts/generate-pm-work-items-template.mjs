/**
 * 產生 data/pm-work-items.xlsx 範本（含填寫範例與說明工作表）
 * 執行：npm run generate:pm-work-items-template
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const outPath = path.join(dataDir, 'pm-work-items.xlsx');
const fallbackPath = path.join(dataDir, 'pm-work-items.template.xlsx');

const headers = ['專案代號', 'PM工號', '序號', '工作項目名稱', '預估工時', '警示工時'];

const exampleRows = [
  ['PY265-0080', '10101209', '1', '(軟體)軟體建置開發及測試', '100', '100'],
  ['PY265-0080', '10101209', '2', '(軟體)專案庶務及聯繫', '100', '100'],
  ['PY265-0080', '10101209', '3', '(協作單位)專案執行', '100', '100'],
  ['PY266-0001', '10109999', '1', '(軟體)軟體建置開發及測試', '80', '60'],
  ['PY266-0001', '10109999', '2', '(軟體)專案庶務及聯繫', '40', '32'],
  ['PY266-0001', '10109999', '3', '(協作單位)專案執行', '120', '100'],
];

const readmeRows = [
  ['PM WorkItem 批次匯入 — 填寫說明'],
  [],
  ['1. 請在「批次」工作表填寫；每一個專案固定 3 列（序號 1～3）。'],
  ['2. 專案代號：例如 PY265-0080；PM工號：建立 PM 對應時的新增人員工號。'],
  ['3. 工作項目名稱請與範例一致（含前綴軟體/協作單位），工時可依專案調整。'],
  ['4. 可一次填多個專案：同一專案代號+PM工號連續 3 列，再填下一專案。'],
  ['5. 執行：npm run test:workitem-adder（或設定環境變數 BPM_PM_WORK_ITEMS_XLSX 指向你的檔案）'],
  [],
  ['欄位', '說明', '範例'],
  ['專案代號', 'BPM 專案 PY 編號', 'PY265-0080'],
  ['PM工號', '新增 PM 對應用員工編號', '10101209'],
  ['序號', 'WorkItem 序號 1～3', '1'],
  ['工作項目名稱', '三項固定名稱', '(軟體)軟體建置開發及測試'],
  ['預估工時', '預估總工時', '100'],
  ['警示工時', '警示門檻工時', '100'],
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.aoa_to_sheet([headers, ...exampleRows]),
  '批次',
);
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(readmeRows), '說明');

fs.mkdirSync(dataDir, { recursive: true });

function writeWorkbook(target) {
  XLSX.writeFile(wb, target);
  console.log(`已寫入：${target}`);
}

try {
  writeWorkbook(outPath);
} catch (err) {
  if (err?.code === 'EBUSY') {
    writeWorkbook(fallbackPath);
    console.warn(
      `主檔 ${outPath} 被 Excel 鎖定，已改寫 ${fallbackPath}；請關閉 Excel 後再執行一次以覆寫主檔。`,
    );
  } else {
    throw err;
  }
}
