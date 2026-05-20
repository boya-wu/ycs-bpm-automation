import { test } from '@playwright/test';

import { BpmWorkItemAdderBot } from '../bots/BpmWorkItemAdderBot';
import { DEFAULT_PM_WORK_ITEMS } from '../data/default-pm-work-items';

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

test('工時 PM — 檢查專案後建立 PM 對應與 5 筆 WorkItem', async ({ page }) => {
  test.setTimeout(120_000);

  const workItemAddUrl = requireEnv('BPM_WORKITEM_ADD_URL');

  await new BpmWorkItemAdderBot(page).run({
    loginEntryUrl: process.env.BPM_BASE_URL?.trim() || deriveNaNaWebEntry(workItemAddUrl),
    workItemAddUrl,
    user: requireEnv('PLAYWRIGHT_BPM_USER'),
    password: requireEnv('PLAYWRIGHT_BPM_PASSWORD'),
    projectCode:
      process.env.BPM_WORKITEM_PROJECT_CODE?.trim() ||
      process.env.BPM_TARGET_PROJECT_CODE?.trim() ||
      'PY265-0080',
    pmEmpId: process.env.BPM_PM_EMP_ID?.trim() || empIdFromUrl(workItemAddUrl) || '10101209',
    workItems: DEFAULT_PM_WORK_ITEMS,
  });
});
