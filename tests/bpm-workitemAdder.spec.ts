import { test } from '@playwright/test';

import { DEFAULT_PM_WORK_ITEMS } from '../data/default-pm-work-items';
import { BpmLoginPage } from '../pages/BpmLoginPage';
import { BpmWorkItemPmPage } from '../pages/BpmWorkItemPmPage';

const REQUIRED_ENV = ['BPM_WORKITEM_ADD_URL', 'PLAYWRIGHT_BPM_USER', 'PLAYWRIGHT_BPM_PASSWORD'] as const;

const DEFAULT_PROJECT_CODE = 'PY265-0080';
const DEFAULT_PM_EMP_ID = '10101209';

function requireEnv(name: (typeof REQUIRED_ENV)[number]): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`缺少必要環境變數: ${name}（請設定於 .env.local）`);
  }
  return value;
}

function deriveNaNaWebEntryFrom(targetUrl: string): string {
  const parsed = new URL(targetUrl);
  return `${parsed.protocol}//${parsed.host}/NaNaWeb/`;
}

function extractEmpIdFromUrl(url: string): string | undefined {
  try {
    const empid = new URL(url).searchParams.get('empid');
    return empid?.trim() || undefined;
  } catch {
    return undefined;
  }
}

test.describe('工時 PM — WorkItem 自動建立', () => {
  test('先檢查專案是否存在，再建立 PM 對應或新增 5 筆 WorkItem', async ({ page }) => {
    test.setTimeout(120_000);

    const workItemAddUrl = requireEnv('BPM_WORKITEM_ADD_URL');
    const user = requireEnv('PLAYWRIGHT_BPM_USER');
    const password = requireEnv('PLAYWRIGHT_BPM_PASSWORD');

    const loginEntryUrl = process.env.BPM_BASE_URL?.trim() || deriveNaNaWebEntryFrom(workItemAddUrl);
    const projectCode =
      process.env.BPM_WORKITEM_PROJECT_CODE?.trim() ||
      process.env.BPM_TARGET_PROJECT_CODE?.trim() ||
      DEFAULT_PROJECT_CODE;
    const pmEmpId =
      process.env.BPM_PM_EMP_ID?.trim() || extractEmpIdFromUrl(workItemAddUrl) || DEFAULT_PM_EMP_ID;

    const loginPage = new BpmLoginPage(page);
    const pmPage = new BpmWorkItemPmPage(page);

    // 跳轉頁需先登入；完成後再開啟工時 PM 目標網址
    await loginPage.ensureLoggedIn(loginEntryUrl, user, password, 'zh');
    await pmPage.open(workItemAddUrl);

    await pmPage.searchProject(projectCode);

    if (await pmPage.isProjectMissing()) {
      await pmPage.createProjectPmMapping(projectCode, pmEmpId);
      await pmPage.searchProject(projectCode);
    }

    await pmPage.expectProjectExists(projectCode);
    await pmPage.openWorkItemEditor(projectCode);

    for (const row of DEFAULT_PM_WORK_ITEMS) {
      await pmPage.addWorkItemRow(row);
    }
  });
});
