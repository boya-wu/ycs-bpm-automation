import fs from 'fs';
import path from 'path';

import { test } from '@playwright/test';

import { BpmWorkItemAdderBot } from '../bots/BpmWorkItemAdderBot';
import {
  DEFAULT_PM_WORK_ITEMS_XLSX,
  loadPmWorkItemBatchesFromExcel,
} from '../data/load-pm-work-items';

const REQUIRED_ENV = ['BPM_WORKITEM_ADD_URL', 'PLAYWRIGHT_BPM_USER', 'PLAYWRIGHT_BPM_PASSWORD'] as const;

function requireEnv(name: (typeof REQUIRED_ENV)[number]): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少必要環境變數: ${name}（請設定於 .env.local）`);
  return value;
}

function deriveNaNaWebEntry(targetUrl: string): string {
  const { protocol, host } = new URL(targetUrl);
  return `${protocol}//${host}/NaNaWeb/`;
}

function empIdFromUrl(url: string): string | undefined {
  try {
    return new URL(url).searchParams.get('empid')?.trim() || undefined;
  } catch {
    return undefined;
  }
}

test('工時 PM — 檢查專案後建立 PM 對應與 Excel WorkItem', async ({ page }) => {
  // 資料量多時可能耗時較長，故設為 0 以停用 Test Timeout 限制
  test.setTimeout(0);

  const workItemAddUrl = requireEnv('BPM_WORKITEM_ADD_URL');
  const workItemsXlsx =
    process.env.BPM_PM_WORK_ITEMS_XLSX?.trim() || DEFAULT_PM_WORK_ITEMS_XLSX;

  const resolvedPath = path.resolve(workItemsXlsx);
  let xlsxFiles: string[] = [];

  if (fs.existsSync(resolvedPath)) {
    const stat = fs.statSync(resolvedPath);
    if (stat.isDirectory()) {
      xlsxFiles = fs.readdirSync(resolvedPath)
        .filter((file) => file.endsWith('.xlsx') && !file.startsWith('~$'))
        .map((file) => path.join(resolvedPath, file));
    } else {
      xlsxFiles = [resolvedPath];
    }
  } else {
    throw new Error(`找不到指定的 Excel 檔案或資料夾路徑: ${resolvedPath}`);
  }

  const fallbackProjectCode =
    process.env.BPM_WORKITEM_PROJECT_CODE?.trim() ||
    process.env.BPM_TARGET_PROJECT_CODE?.trim() ||
    '';
  const fallbackPmEmpId =
    process.env.BPM_PM_EMP_ID?.trim() || empIdFromUrl(workItemAddUrl) || '';

  const bot = new BpmWorkItemAdderBot(page);
  const loginEntryUrl =
    process.env.BPM_BASE_URL?.trim() || deriveNaNaWebEntry(workItemAddUrl);
  const user = requireEnv('PLAYWRIGHT_BPM_USER');
  const password = requireEnv('PLAYWRIGHT_BPM_PASSWORD');

  for (const file of xlsxFiles) {
    console.log(`\n========== 開始處理 Excel: ${path.basename(file)} ==========`);
    const batches = loadPmWorkItemBatchesFromExcel(file);

    for (const batch of batches) {
      const projectCode = batch.projectCode || fallbackProjectCode;
      const pmEmpId = batch.pmEmpId || fallbackPmEmpId;
      if (!projectCode) {
        throw new Error(
          `Excel [${path.basename(file)}] 未填「專案代號」且無環境變數 BPM_WORKITEM_PROJECT_CODE / BPM_TARGET_PROJECT_CODE`,
        );
      }
      if (!pmEmpId) {
        throw new Error(`Excel [${path.basename(file)}] 未填「PM工號」且無環境變數 BPM_PM_EMP_ID 或 URL empid`);
      }

      console.log(`-> 正在匯入專案: ${projectCode}, PM工號: ${pmEmpId}, 共 ${batch.workItems.length} 筆 WorkItems`);
      await bot.run({
        loginEntryUrl,
        workItemAddUrl,
        user,
        password,
        projectCode,
        pmEmpId,
        workItems: batch.workItems,
      });
    }
    console.log(`========== 完成處理 Excel: ${path.basename(file)} ==========\n`);
  }
});

