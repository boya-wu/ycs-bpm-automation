import { expect, type FrameLocator, type Locator, type Page } from '@playwright/test';

/** 明細檢查結果（供測試統計） */
export type WorkItemCheckOutcome = 'filled' | 'exempt_by_workdesc';

export class BpmWorkItemDetailPage {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  private get detailFrame(): FrameLocator {
    return this.page
      .frameLocator('iframe[name="ifmFucntionLocation"]')
      .frameLocator('iframe[name="ifmAppLocation"]');
  }

  /** 以 #WorkItem_txt 為主（勿用 #WorkItem：同頁常有包裝用 div 會造成 strict 雙重匹配） */
  private workItemLocator(frame: FrameLocator): Locator {
    return frame.locator('#WorkItem_txt');
  }

  async assertWorkItemFilled(): Promise<WorkItemCheckOutcome> {
    const outer = this.page.frameLocator('iframe[name="ifmFucntionLocation"]');
    await expect(outer.locator('iframe[name="ifmAppLocation"]')).toBeAttached({ timeout: 45_000 });

    const frame = this.detailFrame;
    await expect(frame.locator('body')).toBeVisible({ timeout: 15_000 });

    const workItem = this.workItemLocator(frame);

    await expect(workItem).toBeVisible({ timeout: 45_000 });

    if (await this.shouldExemptWorkItemContent(frame)) {
      return 'exempt_by_workdesc';
    }

    await expect
      .poll(
        async () => {
          const handle = await workItem.elementHandle();
          if (!handle) {
            return 0;
          }

          return await handle.evaluate((el) => {
            const inputLike = el as HTMLInputElement | HTMLTextAreaElement;
            const value = typeof inputLike.value === 'string' ? inputLike.value : '';
            const text = el.textContent ?? '';
            return (value || text).trim().length;
          });
        },
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);

    return 'filled';
  }

  /** 表單於工作說明註記無需填 Work Item 時，不強制 #WorkItem_txt 有值（仍已驗證欄位存在） */
  private async shouldExemptWorkItemContent(frame: FrameLocator): Promise<boolean> {
    const desc = frame.locator('#WorkDesc');
    if ((await desc.count()) === 0) {
      return false;
    }

    let text = '';
    try {
      text = await desc.inputValue();
    } catch {
      text = (await desc.textContent()) ?? '';
    }

    return /無\s*workitem/i.test(text);
  }
}
