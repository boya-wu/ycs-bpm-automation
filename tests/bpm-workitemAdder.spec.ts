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
  test.setTimeout(120_000);

  const workItemAddUrl = requireEnv('BPM_WORKITEM_ADD_URL');
  const workItemsXlsx =
    process.env.BPM_PM_WORK_ITEMS_XLSX?.trim() || DEFAULT_PM_WORK_ITEMS_XLSX;
  const batches = loadPmWorkItemBatchesFromExcel(workItemsXlsx);

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

  for (const batch of batches) {
    const projectCode = batch.projectCode || fallbackProjectCode;
    const pmEmpId = batch.pmEmpId || fallbackPmEmpId;
    if (!projectCode) {
      throw new Error(
        'Excel 未填「專案代號」且無環境變數 BPM_WORKITEM_PROJECT_CODE / BPM_TARGET_PROJECT_CODE',
      );
    }
    if (!pmEmpId) {
      throw new Error('Excel 未填「PM工號」且無環境變數 BPM_PM_EMP_ID 或 URL empid');
    }

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
});
