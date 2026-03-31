import { expect, type FrameLocator, type Locator, type Page } from '@playwright/test';

/** 明細檢查結果（供測試統計） */
export type WorkItemCheckOutcome = 'filled' | 'empty';
export type ReexecuteResult = {
  popupVerified: boolean;
  signal: string;
};

type ReexecuteTypePreference = 'first' | 'prev';

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

    const handle = await workItem.elementHandle();
    if (!handle) {
      return 'empty';
    }

    const length = await handle.evaluate((el) => {
      const inputLike = el as HTMLInputElement | HTMLTextAreaElement;
      const value = typeof inputLike.value === 'string' ? inputLike.value : '';
      const text = el.textContent ?? '';
      return (value || text).trim().length;
    });

    return length > 0 ? 'filled' : 'empty';
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

    // 原生 confirm 若未 accept，系統會停在選擇頁不會真正送出。
    // 必須在 waitForLoadState 之前掛載，避免頁面載入期間觸發的 dialog 被 Playwright 預設 dismiss。
    // 同時捕捉「第一個關卡」錯誤訊息，避免 popup 關閉後被誤判為退回成功。
    let firstCheckpointError = false;
    popup.on('dialog', (dialog) => {
      const msg = dialog.message();
      if (msg.includes('第一個關卡') || msg.includes('沒有允許可退回') || msg.includes('免許可退回')) {
        firstCheckpointError = true;
      }
      void dialog.accept().catch(() => {});
    });

    try {
      await popup.waitForLoadState('domcontentloaded', { timeout: 20_000 });
    } catch {
      if (popup.isClosed()) {
        return { popupVerified: true, signal: 'popup-closed-before-domcontentloaded' };
      }
      return { popupVerified: false, signal: 'popup-loadstate-failed' };
    }
    const beforeUrl = popup.url();

    const activityRadio = popup.locator('input[name="rdoActivityInstOID"]').first();
    if ((await activityRadio.count()) > 0) {
      await activityRadio.check();
    }

    const reexecuteTypeFirst = popup.locator('#rdoReexecuteType1');
    const reexecuteTypePrev = popup.locator('#rdoReexecuteType0');
    await this.chooseReexecuteTypeRadio(popup, { first: reexecuteTypeFirst, prev: reexecuteTypePrev });

    const popupComment = popup.locator('#txaExecutiveComment');
    if ((await popupComment.count()) > 0) {
      await popupComment.fill(normalized);
    }

    // Reexecute 視窗內容常在 popup 的 iframe 內；僅對 Page 根層 getByRole 會找不到 Confirm。
    await this.clickReexecuteConfirmInPopup(popup);

    const result = await this.verifyReexecuteSuccess(popup, beforeUrl);
    // verifyReexecuteSuccess 的各段等待期間，dialog 事件必然已觸發並設定 flag。
    // 若為「第一個關卡」錯誤，popup 關閉不代表退回成功，以此 override。
    if (firstCheckpointError) {
      return { popupVerified: false, signal: 'first-checkpoint-no-return' };
    }
    return result;
  }

  private parseReexecuteTypePreferenceFromEnv(): ReexecuteTypePreference | null {
    const raw = process.env.BPM_REEXECUTE_TYPE?.trim();
    if (!raw) {
      return null;
    }

    // 支援兩種寫法：
    // - 值 (與 input.value 對齊): 0(退回前一關) / 2(退回第一關)
    // - 可讀字串: prev / first
    if (raw === '0' || raw.toLowerCase() === 'prev') {
      return 'prev';
    }
    if (raw === '2' || raw.toLowerCase() === 'first') {
      return 'first';
    }

    throw new Error(`BPM_REEXECUTE_TYPE 無效: "${raw}"，允許值為 0|2|prev|first`);
  }

  private async chooseReexecuteTypeRadio(
    popup: Page,
    radios: { first: Locator; prev: Locator },
  ): Promise<void> {
    const prefer = this.parseReexecuteTypePreferenceFromEnv();
    const hasFirst = (await radios.first.count()) > 0;
    const hasPrev = (await radios.prev.count()) > 0;

    if (!hasFirst && !hasPrev) {
      return;
    }

    const pick = async (locator: Locator) => {
      await expect(locator.first()).toBeVisible({ timeout: 10_000 });
      await locator.first().check();
    };

    // 若兩者都存在：
    // - 有設定 env：照設定選
    // - 未設定 env：維持原預設（first 優先），避免改動既有行為
    if (hasFirst && hasPrev) {
      if (prefer === 'prev') {
        await pick(radios.prev);
        return;
      }
      await pick(radios.first);
      return;
    }

    // 僅有一個存在時，直接勾選可用的那個。
    if (hasFirst) {
      await pick(radios.first);
      return;
    }
    await pick(radios.prev);
  }

  /**
   * 在 popup 內所有 frame（含巢狀 iframe）尋找可點擊的「確定 / Confirm」。
   * 以 poll 等待可見且 enabled，且只在找到後 click 一次，避免輪詢中重複點擊。
   */
  private async clickReexecuteConfirmInPopup(popup: Page): Promise<boolean> {
    let target: Locator | null = null;
    try {
      await expect
        .poll(
          async () => {
            for (const frame of popup.frames()) {
              // BPM Reexecute 視窗為 <div id="btnRexecute" class="bpm-dialog-main-buttom">Confirm</div>，無 semantic button role。
              const byVendorId = frame.locator('#btnRexecute');
              if ((await byVendorId.count()) > 0) {
                const div = byVendorId.first();
                const visible = await div.isVisible().catch(() => false);
                if (visible) {
                  target = div;
                  return true;
                }
              }

              const byRole = frame.getByRole('button', { name: /Confirm|確定/ });
              const roleCount = await byRole.count();
              for (let i = 0; i < roleCount; i += 1) {
                const btn = byRole.nth(i);
                const visible = await btn.isVisible().catch(() => false);
                const enabled = visible ? await btn.isEnabled().catch(() => false) : false;
                if (visible && enabled) {
                  target = btn;
                  return true;
                }
              }

              const byLabel = frame
                .getByText('Confirm', { exact: true })
                .or(frame.getByText('確定', { exact: true }));
              const labelCount = await byLabel.count();
              for (let k = 0; k < labelCount; k += 1) {
                const labelBtn = byLabel.nth(k);
                const visible = await labelBtn.isVisible().catch(() => false);
                const enabled = visible ? await labelBtn.isEnabled().catch(() => false) : false;
                if (visible && enabled) {
                  target = labelBtn;
                  return true;
                }
              }

              const legacy = frame.locator(
                'input[type="submit"][value*="Confirm" i], input[type="button"][value*="Confirm" i], input[type="submit"][value*="確定"], input[type="button"][value*="確定"]',
              );
              const legacyCount = await legacy.count();
              for (let j = 0; j < legacyCount; j += 1) {
                const inp = legacy.nth(j);
                const visible = await inp.isVisible().catch(() => false);
                const enabled = visible ? await inp.isEnabled().catch(() => false) : false;
                if (visible && enabled) {
                  target = inp;
                  return true;
                }
              }
            }
            return false;
          },
          { timeout: 20_000, intervals: [200, 400, 600, 1_000] },
        )
        .toBe(true);
    } catch {
      return false;
    }

    if (!target) {
      return false;
    }

    await target.click();
    return true;
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
