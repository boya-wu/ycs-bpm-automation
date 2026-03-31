import fs from 'fs';
import path from 'path';

import { expect, test } from '@playwright/test';
import { BpmLoginPage } from '../pages/BpmLoginPage';
import { BpmWorkItemDetailPage } from '../pages/BpmWorkItemDetailPage';
import { BpmWorklistPage } from '../pages/BpmWorklistPage';

type WorkItemStats = {
  formsChecked: number;
  workItemFilled: number;
  emptyWorkItem: number;
  reexecuteAttempted: number;
  reexecuteVerifiedByPopup: number;
  reexecuteVerifiedByWorklistTag: number;
  reexecuteVerifiedFinal: number;
  returnedItems: string[];
  firstCheckpointBlockedItems: string[];
  pendingVerifyItems: string[];
};

type DailyState = {
  runCount: number;
  /**
   * 用穩定 key 去重（避免同一筆單 subject 顯示不同字串導致重複計數）。
   * key -> 首次觀察到的 subject（作為顯示用）。
   */
  returnedByKey: Record<string, string>;
};

function normalizeWorklistSubject(raw: string): string {
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  // worklist subject 常混入時間欄位（例如 22:25）造成同筆被判定不同筆，這裡移除尾端純時間 token。
  return collapsed.replace(/\s+\d{1,2}:\d{2}(\s+\d{1,2}:\d{2})*$/g, '').trim();
}

function deriveWorkItemKey(subject: string): string {
  // 以「工時申請單-<digits> + 工作日 + 工時」為主鍵（避免同一張單的多列明細被錯誤合併）
  // 注意：清單 Subject 在退回後可能出現「Reexecute」等前綴，但下列 regex 仍會命中同一組
  // `工時申請單-<id>` / 工作日 / 工時，不應依賴字串是否以 Reexecute 開頭。
  const normalized = normalizeWorklistSubject(subject);
  const idMatch = normalized.match(/工時申請單-\d+/);
  const workDateMatch = normalized.match(/工作日:\s*(\d{4}\/\d{2}\/\d{2})/);
  const hoursMatch = normalized.match(/工時:\s*([0-9]+(?:\.[0-9]+)?)/);

  if (idMatch?.[0]) {
    const parts = [idMatch[0]];
    if (workDateMatch?.[1]) {
      parts.push(`date=${workDateMatch[1]}`);
    }
    if (hoursMatch?.[1]) {
      parts.push(`hours=${hoursMatch[1]}`);
    }
    return parts.join('|');
  }
  // 若未命中（避免完全失敗），退回較粗的 normalized 字串
  return normalized;
}

function taipeiDateYYYYMMDD(d = new Date()): string {
  // sv-SE 會輸出 YYYY-MM-DD；搭配 Asia/Taipei 避免 UTC 跨日造成檔名錯誤
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
}

function formatWorkItemStats(s: WorkItemStats, projectCode: string, approvalComment: string): string {
  const returnList = s.returnedItems.length > 0 ? s.returnedItems.join(' | ') : '（無）';
  const blockedList =
    s.firstCheckpointBlockedItems.length > 0 ? s.firstCheckpointBlockedItems.join(' | ') : '（無）';
  return [
    '--- Work Item 檢查統計 ---',
    `專案代號篩選: ${projectCode}`,
    `簽核內容參數: ${approvalComment}`,
    `工時申請單明細已開啟並檢查: ${s.formsChecked} 筆`,
    `  · #WorkItem_txt 有內容（非空白）: ${s.workItemFilled} 筆`,
    `  · #WorkItem_txt 為空（須退回重辦）: ${s.emptyWorkItem} 筆`,
    `  · 已嘗試退回筆數: ${s.reexecuteAttempted} 筆`,
    `  · 退回成功（popup 訊號）: ${s.reexecuteVerifiedByPopup} 筆`,
    `  · 退回成功（清單前綴）: ${s.reexecuteVerifiedByWorklistTag} 筆`,
    `  · 退回成功後置驗證通過: ${s.reexecuteVerifiedFinal} 筆`,
    `  · 已驗證退回清單（${s.returnedItems.length} 筆）: ${returnList}`,
    `  · 系統阻擋（第一個關卡/無可退回關卡）（${s.firstCheckpointBlockedItems.length} 筆）: ${blockedList}`,
    `  · 待人工確認清單: ${s.pendingVerifyItems.length > 0 ? s.pendingVerifyItems.join(' | ') : '（無）'}`,
    '---------------------------',
  ].join('\n');
}

function formatDailyLogEntry(s: WorkItemStats, dailyTotalReturned: number, timestamp: string): string {
  const thisRunSubjects = s.returnedItems.map((item) => normalizeWorklistSubject(item.replace(/ \[popup:.*/, '')));
  const returnedLines =
    thisRunSubjects.length > 0
      ? thisRunSubjects.map((subject, i) => `${i + 1}. ${subject}`).join('\n')
      : '（無）';
  return [
    `=== ${timestamp} ===`,
    `有 WorkItem：${s.workItemFilled} 筆`,
    `無 WorkItem：${s.emptyWorkItem} 筆`,
    `已退回成功：${s.reexecuteVerifiedFinal} 筆`,
    returnedLines,
    `今日累計退回：${dailyTotalReturned} 筆`,
    '---------------------------',
    '',
  ].join('\n');
}

const REQUIRED_ENV = ['BPM_BASE_URL', 'PLAYWRIGHT_BPM_USER', 'PLAYWRIGHT_BPM_PASSWORD'] as const;
const DEFAULT_TARGET_PROJECT_CODE = 'DY23-0742';
const DEFAULT_APPROVAL_COMMENT = '請補上 WorkItem。';

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
  const locale = 'en';
  const targetProjectCode = process.env.BPM_TARGET_PROJECT_CODE?.trim() || DEFAULT_TARGET_PROJECT_CODE;
  const approvalComment = process.env.BPM_APPROVAL_COMMENT?.trim() || DEFAULT_APPROVAL_COMMENT;
  const enableReexecute = process.env.BPM_ENABLE_REEXECUTE === 'true';

  const loginPage = new BpmLoginPage(page);
  const worklistPage = new BpmWorklistPage(page);
  const detailPage = new BpmWorkItemDetailPage(page);

  await loginPage.goto(baseUrl);
  await loginPage.login(user, password, locale);
  await worklistPage.waitUntilReady();
  await worklistPage.setPageSizeTo100IfAvailable();

  let hasAnyWorktimeForm = false;
  const stats: WorkItemStats = {
    formsChecked: 0,
    workItemFilled: 0,
    emptyWorkItem: 0,
    reexecuteAttempted: 0,
    reexecuteVerifiedByPopup: 0,
    reexecuteVerifiedByWorklistTag: 0,
    reexecuteVerifiedFinal: 0,
    returnedItems: [],
    firstCheckpointBlockedItems: [],
    pendingVerifyItems: [],
  };
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
      const subject = await worklistPage.getProcessSubjectByProjectCodeIndex('工時申請單', targetProjectCode, index);
      let reexecuteResult: Awaited<ReturnType<typeof detailPage.reexecuteWithComment>> | null = null;
      await worklistPage.openProcessByProjectCodeIndex('工時申請單', targetProjectCode, index);
      const outcome = await detailPage.assertWorkItemFilled();
      stats.formsChecked += 1;
      if (outcome === 'filled') {
        stats.workItemFilled += 1;
      } else {
        stats.emptyWorkItem += 1;
        if (enableReexecute) {
          stats.reexecuteAttempted += 1;
          reexecuteResult = await detailPage.reexecuteWithComment(approvalComment);
          if (reexecuteResult.popupVerified) {
            stats.reexecuteVerifiedByPopup += 1;
          }
        } else {
          stats.pendingVerifyItems.push(`${subject} [dry-run, BPM_ENABLE_REEXECUTE=false]`);
        }
      }
      await worklistPage.backToWorkListFromDetailIfVisible();
      await worklistPage.waitUntilReady();

      if (reexecuteResult) {
        if (reexecuteResult.signal === 'first-checkpoint-no-return') {
          stats.firstCheckpointBlockedItems.push(subject);
        } else {
          const worklistTagVerified = await worklistPage.hasReturnedPrefixForSubject(subject);
          if (worklistTagVerified) {
            stats.reexecuteVerifiedByWorklistTag += 1;
          }

          const verified = reexecuteResult.popupVerified || worklistTagVerified;
          if (verified) {
            stats.reexecuteVerifiedFinal += 1;
            const worklistSignal = worklistTagVerified ? 'returned-prefix' : 'no-prefix';
            stats.returnedItems.push(`${subject} [popup:${reexecuteResult.signal}, worklist:${worklistSignal}]`);
          } else {
            stats.pendingVerifyItems.push(subject);
          }
        }
      }
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

  const summaryText = formatWorkItemStats(stats, targetProjectCode, approvalComment);
  console.log(`\n${summaryText}\n`);
  await test.info().attach('work-item-check-summary.txt', {
    body: Buffer.from(summaryText, 'utf-8'),
    contentType: 'text/plain; charset=utf-8',
  });

  const today = taipeiDateYYYYMMDD();
  const logDir = path.join(process.cwd(), 'logs');
  fs.mkdirSync(logDir, { recursive: true });

  const stateFile = path.join(logDir, `${today}.json`);
  let daily: DailyState = { runCount: 0, returnedByKey: {} };
  if (fs.existsSync(stateFile)) {
    try {
      const raw = JSON.parse(fs.readFileSync(stateFile, 'utf-8')) as Partial<DailyState> & {
        // 舊版格式相容
        allReturnedSubjects?: string[];
      };
      daily.runCount = typeof raw.runCount === 'number' ? raw.runCount : 0;
      daily.returnedByKey = raw.returnedByKey && typeof raw.returnedByKey === 'object' ? raw.returnedByKey : {};
      if (Array.isArray(raw.allReturnedSubjects)) {
        for (const subject of raw.allReturnedSubjects) {
          const key = deriveWorkItemKey(subject);
          if (key && !daily.returnedByKey[key]) {
            daily.returnedByKey[key] = subject;
          }
        }
      }

      // 兼容舊版/過粗 key：若現存 key 與 deriveWorkItemKey 不一致，且可推導出更精準 key，則搬移至新 key。
      for (const [key, subject] of Object.entries(daily.returnedByKey)) {
        const derived = deriveWorkItemKey(subject);
        if (derived && derived !== key) {
          if (!daily.returnedByKey[derived]) {
            daily.returnedByKey[derived] = subject;
          }
          delete daily.returnedByKey[key];
        }
      }
    } catch {
      // 狀態檔損毀時重新計算，不中斷執行
    }
  }

  daily.runCount += 1;
  const thisRunSubjects = stats.returnedItems.map((item) => normalizeWorklistSubject(item.replace(/ \[popup:.*/, '')));
  for (const subject of thisRunSubjects) {
    const key = deriveWorkItemKey(subject);
    if (key && !daily.returnedByKey[key]) {
      daily.returnedByKey[key] = subject;
    }
  }
  fs.writeFileSync(stateFile, JSON.stringify(daily, null, 2), 'utf-8');

  const timestamp = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
  const entry = formatDailyLogEntry(stats, Object.keys(daily.returnedByKey).length, timestamp);
  fs.appendFileSync(path.join(logDir, `${today}.txt`), entry, 'utf-8');
});

test.describe('WorkItem subject 去重鍵（純邏輯，不依 BPM）', () => {
  test('首次無 Reexecute 與退回後含 Reexecute／列前綴時，deriveWorkItemKey 應相同', () => {
    const firstPass =
      '工時申請單-10101209吳柏亞,專案代碼:DY23-0742,專案名稱:台南軟體課,工作日:2026/03/20,工時:2';
    const afterReexecute = `Reexecute${firstPass}`;
    const withRowNoisyPrefix = `2 工時申請單 協助測試 ${afterReexecute} 23:05 吳柏亞 12Hours`;
    const expected = '工時申請單-10101209|date=2026/03/20|hours=2';
    expect(deriveWorkItemKey(firstPass)).toBe(expected);
    expect(deriveWorkItemKey(afterReexecute)).toBe(expected);
    expect(deriveWorkItemKey(withRowNoisyPrefix)).toBe(expected);
  });
});