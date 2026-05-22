import { expect, type Page } from '@playwright/test';

import type { PmWorkItemRow } from '../data/pm-work-item';

export type WorkItemAdderOptions = {
  /** NaNaWeb 入口（登入用；CustomOpenWin 需先登入再開目標頁） */
  loginEntryUrl: string;
  /** 工時 PM 設定頁（登入後 goto） */
  workItemAddUrl: string;
  user: string;
  password: string;
  projectCode: string;
  pmEmpId: string;
  workItems: readonly PmWorkItemRow[];
};

type LoginLocale = 'zh' | 'en';

/**
 * 工時 PM WorkItem 自動建立：登入 → 開啟目標頁 → 檢查專案 → 必要時建立 PM 對應 → 批次新增 WorkItem。
 */
export class BpmWorkItemAdderBot {
  constructor(private readonly page: Page) {}

  async run(opts: WorkItemAdderOptions): Promise<void> {
    await this.ensureLoggedIn(opts.loginEntryUrl, opts.user, opts.password);
    await this.openPmPage(opts.workItemAddUrl);
    await this.searchProject(opts.projectCode);

    if (await this.isProjectMissing()) {
      await this.createProjectPmMapping(opts.projectCode, opts.pmEmpId);
      await this.searchProject(opts.projectCode);
    }

    await this.expectProjectExists(opts.projectCode);
    await this.openWorkItemEditor(opts.projectCode);

    for (const row of opts.workItems) {
      this.page.once('dialog', (d) => void d.accept());
      await this.addWorkItemRow(row);
    }
  }

  private async ensureLoggedIn(entryUrl: string, username: string, password: string): Promise<void> {
    const popupPromise = this.page.waitForEvent('popup', { timeout: 12_000 });
    await this.page.goto(entryUrl);

    let popup: Page | null = null;
    try {
      popup = await popupPromise;
    } catch {
      popup = null;
    }

    if (popup) {
      await this.submitLogin(popup, username, password, 'zh');
      await popup.waitForEvent('close', { timeout: 30_000 }).catch(() => {});
      return;
    }

    const { userTextbox } = await this.resolveLoginFields(this.page, 'zh');
    if (await userTextbox.isVisible().catch(() => false)) {
      await this.submitLogin(this.page, username, password, 'zh');
    }
  }

  private async openPmPage(url: string): Promise<void> {
    await this.page.goto(url);
    await expect(this.page.locator('#txtProject')).toBeVisible({ timeout: 30_000 });
  }

  private async searchProject(projectCode: string): Promise<void> {
    const projectInput = this.page.locator('#txtProject');
    await expect(projectInput).toBeVisible();
    await projectInput.fill(projectCode);
    await this.page.getByRole('button', { name: '查詢' }).click();
    await expect(this.page.locator('#gvPM')).toBeVisible();
  }

  private async isProjectMissing(): Promise<boolean> {
    return this.page.getByRole('cell', { name: '無相關資料' }).isVisible();
  }

  private async expectProjectExists(projectCode: string): Promise<void> {
    await expect(this.page.getByRole('cell', { name: '無相關資料' })).toBeHidden();
    await expect(this.page.locator('#gvPM').getByText(projectCode, { exact: true })).toBeVisible();
  }

  private async createProjectPmMapping(projectCode: string, pmEmpId: string): Promise<void> {
    await expect(this.page.getByRole('cell', { name: '無相關資料' })).toBeVisible();
    await this.page.locator('#txtProject').fill(projectCode);
    await this.page.locator('#txtPMEmp').fill(pmEmpId);
    this.page.once('dialog', (d) => void d.accept());
    await this.page.getByRole('button', { name: '新增' }).click();
    await expect(this.page.getByRole('cell', { name: '無相關資料' })).toBeHidden({ timeout: 15_000 });
  }

  private async openWorkItemEditor(projectCode: string): Promise<void> {
    const projectRow = this.page.locator('#gvPM tr').filter({ hasText: projectCode });
    await projectRow.getByRole('button', { name: 'WorkItem' }).click();
    await expect(this.page.locator('#txtNum')).toBeVisible({ timeout: 15_000 });
  }

  private async addWorkItemRow(row: PmWorkItemRow): Promise<void> {
    await this.page.locator('#txtNum').fill(row.num);
    await this.page.locator('#txtWorkItem').fill(row.name);
    await this.page.locator('#txtHour').fill(row.hour);
    await this.page.locator('#txtAlarmHour').fill(row.alarmHour);
    await this.page.getByRole('button', { name: '新 增' }).click();
    await expect(this.page.locator('#txtNum')).toBeVisible();
  }

  private async submitLogin(
    target: Page,
    username: string,
    password: string,
    locale: LoginLocale,
  ): Promise<void> {
    const { userTextbox, passwordTextbox } = await this.resolveLoginFields(target, locale);
    await userTextbox.click();
    await userTextbox.fill(username);
    await passwordTextbox.fill(password);

    const loginBtn = target.getByRole('button', { name: '登入' });
    if (await loginBtn.isVisible().catch(() => false)) {
      await loginBtn.click();
      return;
    }
    await passwordTextbox.press('Enter');
  }

  private async resolveLoginFields(target: Page, preferred: LoginLocale) {
    const order: LoginLocale[] = preferred === 'en' ? ['en', 'zh'] : ['zh', 'en'];

    for (const loc of order) {
      const userTextbox = this.userTextbox(target, loc);
      const passwordTextbox = this.passwordTextbox(target, loc);
      if ((await userTextbox.count()) === 0) continue;
      try {
        await expect(userTextbox).toBeVisible({ timeout: 5000 });
        await expect(passwordTextbox).toBeVisible({ timeout: 5000 });
        return { userTextbox, passwordTextbox };
      } catch {
        // 嘗試下一語系
      }
    }

    throw new Error(`找不到登入文字框（已嘗試語系: ${order.join(', ')}）`);
  }

  private userTextbox(target: Page, locale: LoginLocale) {
    if (locale === 'en') {
      return target.getByRole('textbox', { name: 'LDAP User ID' });
    }
    return target
      .getByRole('textbox', { name: 'LDAP 代 號' })
      .or(target.getByRole('textbox', { name: 'LDAP 代号' }));
  }

  private passwordTextbox(target: Page, locale: LoginLocale) {
    if (locale === 'en') {
      return target.getByRole('textbox', { name: 'Password' });
    }
    return target
      .getByRole('textbox', { name: '密 碼' })
      .or(target.getByRole('textbox', { name: '密码' }));
  }
}
