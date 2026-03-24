import { expect, type FrameLocator, type Locator, type Page } from '@playwright/test';

/** 明細檢查結果（供測試統計） */
export type WorkItemCheckOutcome = 'filled' | 'exempt_by_workdesc';
export type ReexecuteResult = {
  popupVerified: boolean;
  signal: string;
};

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

  private get functionFrame(): FrameLocator {
    return this.page.frameLocator('iframe[name="ifmFucntionLocation"]');
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

  /**
   * 在明細頁執行「退回重辦」：先填簽核意見，再點退回按鈕。
   */
  async reexecuteWithComment(comment: string): Promise<ReexecuteResult> {
    const frame = this.functionFrame;
    const normalized = comment.trim() || '請補上 WorkItem。';

    const commentBox = frame
      .getByRole('textbox', { name: /Executive comment/i })
      .or(frame.getByRole('textbox', { name: /簽核意見/ }));
    await expect(commentBox.first()).toBeVisible({ timeout: 20_000 });
    await commentBox.first().fill(normalized);

    const reexecute = frame
      .getByText(/Reexecute Activity/i)
      .or(frame.getByText(/退回重辦/))
      .or(frame.getByRole('button', { name: /Reexecute Activity/i }))
      .or(
        frame.locator(
          '[title="Reexecute Activity"], [aria-label="Reexecute Activity"], [title="退回重辦"], [aria-label="退回重辦"]',
        ),
      );
    await expect(reexecute.first()).toBeVisible({ timeout: 20_000 });
    const popupPromise = this.page.waitForEvent('popup', { timeout: 20_000 }).catch(() => null);
    await reexecute.first().click();
    const popup = await popupPromise;
    if (!popup) {
      return { popupVerified: false, signal: 'popup-not-opened' };
    }

    await popup.waitForLoadState('domcontentloaded', { timeout: 20_000 });
    const beforeUrl = popup.url();

    // 原生 confirm 若未 accept，系統會停在選擇頁不會真正送出。
    popup.on('dialog', (dialog) => {
      void dialog.accept().catch(() => {});
    });

    const activityRadio = popup.locator('input[name="rdoActivityInstOID"]').first();
    if ((await activityRadio.count()) > 0) {
      await activityRadio.check();
    }

    const reexecuteTypeFirst = popup.locator('#rdoReexecuteType1');
    const reexecuteTypePrev = popup.locator('#rdoReexecuteType0');
    if ((await reexecuteTypeFirst.count()) > 0) {
      await reexecuteTypeFirst.check();
    } else if ((await reexecuteTypePrev.count()) > 0) {
      await reexecuteTypePrev.check();
    }

    const popupComment = popup.locator('#txaExecutiveComment');
    if ((await popupComment.count()) > 0) {
      await popupComment.fill(normalized);
    }

    const confirmButton = popup
      .getByRole('button', { name: /^確定$/ })
      .or(popup.getByRole('button', { name: /^Confirm$/i }))
      .or(popup.getByText(/^確定$/))
      .or(popup.getByText(/^Confirm$/i));
    await expect(confirmButton.first()).toBeVisible({ timeout: 20_000 });
    await confirmButton.first().click();

    const verify = await this.verifyReexecuteSuccess(popup, beforeUrl);
    return verify;
  }

  /**
   * 點擊退回後驗證是否出現成功狀態。
   * 目前採用多訊號判定，避免單一訊號變動造成誤判。
   */
  private async verifyReexecuteSuccess(
    popup: Page,
    beforeUrl: string,
  ): Promise<ReexecuteResult> {
    if (popup.isClosed()) {
      return { popupVerified: true, signal: 'popup-closed' };
    }

    const chooseTitle = popup.getByText(/請選擇要退回至下列哪一個關卡/i).first();
    if ((await chooseTitle.count()) > 0) {
      try {
        await expect(chooseTitle).toBeHidden({ timeout: 10_000 });
        return { popupVerified: true, signal: 'choose-step-hidden' };
      } catch {
        // Continue checking other success signals.
      }
    }

    const successTexts: Locator[] = [
      popup.getByText(/成功|完成|successfully|success/i).first(),
      popup.getByText(/Back To Work List|返回工作清單/i).first(),
    ];
    for (const locator of successTexts) {
      if ((await locator.count()) === 0) {
        continue;
      }
      try {
        await expect(locator).toBeVisible({ timeout: 8_000 });
        return { popupVerified: true, signal: 'popup-success-text' };
      } catch {
        // Continue checking next signal.
      }
    }

    const afterUrl = popup.url();
    if (afterUrl && beforeUrl && afterUrl !== beforeUrl) {
      return { popupVerified: true, signal: 'popup-url-changed' };
    }

    return { popupVerified: false, signal: 'popup-no-success-signal' };
  }
}
