import { test } from '@playwright/test';
import { BpmLoginPage } from '../pages/BpmLoginPage';
import { BpmWorkItemDetailPage } from '../pages/BpmWorkItemDetailPage';
import { BpmWorklistPage } from '../pages/BpmWorklistPage';

type WorkItemStats = {
  formsChecked: number;
  workItemFilled: number;
  exemptByWorkDesc: number;
};

function formatWorkItemStats(s: WorkItemStats, projectCode: string): string {
  return [
    '--- Work Item 檢查統計 ---',
    `專案代號篩選: ${projectCode}`,
    `工時申請單明細已開啟並檢查: ${s.formsChecked} 筆`,
    `  · #WorkItem_txt 有內容（非空白）: ${s.workItemFilled} 筆`,
    `  · 工作說明含「無 workitem」而豁免內容檢查: ${s.exemptByWorkDesc} 筆`,
    '---------------------------',
  ].join('\n');
}

const REQUIRED_ENV = ['BPM_BASE_URL', 'PLAYWRIGHT_BPM_USER', 'PLAYWRIGHT_BPM_PASSWORD'] as const;
const DEFAULT_TARGET_PROJECT_CODE = 'DY23-0742';

function requireEnv(name: (typeof REQUIRED_ENV)[number]): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`缺少必要環境變數: ${name}`);
  }
  return value;
}

test('每頁每列工時申請單都必須有填寫 Work Item', async ({ page }) => {
  test.setTimeout(180_000);

  const baseUrl = requireEnv('BPM_BASE_URL');
  const user = requireEnv('PLAYWRIGHT_BPM_USER');
  const password = requireEnv('PLAYWRIGHT_BPM_PASSWORD');
  const locale = process.env.BPM_LOGIN_LOCALE === 'en' ? 'en' : 'zh';
  const targetProjectCode = process.env.BPM_TARGET_PROJECT_CODE?.trim() || DEFAULT_TARGET_PROJECT_CODE;

  const loginPage = new BpmLoginPage(page);
  const worklistPage = new BpmWorklistPage(page);
  const detailPage = new BpmWorkItemDetailPage(page);

  await loginPage.goto(baseUrl);
  await loginPage.login(user, password, locale);
  await worklistPage.waitUntilReady();
  await worklistPage.setPageSizeTo100IfAvailable();

  let hasAnyWorktimeForm = false;
  const stats: WorkItemStats = { formsChecked: 0, workItemFilled: 0, exemptByWorkDesc: 0 };
  let safeguard = 0;
  const maxPages = Number.parseInt(process.env.BPM_MAX_PAGES ?? '100', 10);

  while (safeguard < maxPages) {
    safeguard += 1;

    const formCount = await worklistPage.getProcessCellCountByProjectCodeInCurrentPage(
      '工時申請單',
      targetProjectCode,
    );
    for (let index = 0; index < formCount; index += 1) {
      hasAnyWorktimeForm = true;
      await worklistPage.openProcessByProjectCodeIndex('工時申請單', targetProjectCode, index);
      const outcome = await detailPage.assertWorkItemFilled();
      stats.formsChecked += 1;
      if (outcome === 'filled') {
        stats.workItemFilled += 1;
      } else {
        stats.exemptByWorkDesc += 1;
      }
      await worklistPage.backToWorkListFromDetailIfVisible();
      await worklistPage.waitUntilReady();
    }

    const moved = await worklistPage.goToNextPageIfPossible();
    if (!moved) {
      break;
    }
  }

  if (safeguard >= maxPages) {
    throw new Error(`超過分頁安全上限 ${maxPages}，請檢查分頁控制元件是否變更`);
  }

  test.skip(!hasAnyWorktimeForm, '目前清單沒有工時申請單資料，略過 Work Item 內容檢查');

  const summaryText = formatWorkItemStats(stats, targetProjectCode);
  console.log(`\n${summaryText}\n`);
  await test.info().attach('work-item-check-summary.txt', {
    body: Buffer.from(summaryText, 'utf-8'),
    contentType: 'text/plain; charset=utf-8',
  });
});