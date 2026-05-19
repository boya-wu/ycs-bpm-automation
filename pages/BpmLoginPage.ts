import { expect, type Page } from '@playwright/test';

type LoginLocale = 'zh' | 'en';

export class BpmLoginPage {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(baseUrl: string): Promise<void> {
    await this.page.goto(baseUrl);
  }

  async login(username: string, password: string, locale: LoginLocale = 'en'): Promise<void> {
    await this.fillCredentialsAndSubmit(this.page, username, password, locale);
    await expect(this.page.locator('iframe[name="ifmFucntionLocation"]')).toBeVisible();
  }

  /**
   * 進入 BPM 入口（可能彈出登入視窗），完成登入。
   * 工時 PM 等 CustomOpenWin 頁面需先登入再 goto 目標網址時使用。
   */
  async ensureLoggedIn(entryUrl: string, username: string, password: string, locale: LoginLocale = 'zh'): Promise<void> {
    const popupPromise = this.page.waitForEvent('popup', { timeout: 12_000 });
    await this.page.goto(entryUrl);

    let popup: Page | null = null;
    try {
      popup = await popupPromise;
    } catch {
      popup = null;
    }

    if (popup) {
      await this.fillCredentialsAndSubmit(popup, username, password, locale);
      await popup.waitForEvent('close', { timeout: 30_000 }).catch(() => {});
      return;
    }

    const { userTextbox } = await this.resolveLoginFieldsOn(this.page, locale);
    if (await userTextbox.isVisible().catch(() => false)) {
      await this.fillCredentialsAndSubmit(this.page, username, password, locale);
    }
  }

  private async fillCredentialsAndSubmit(
    target: Page,
    username: string,
    password: string,
    locale: LoginLocale,
  ): Promise<void> {
    const { userTextbox, passwordTextbox } = await this.resolveLoginFieldsOn(target, locale);

    await userTextbox.click();
    await userTextbox.fill(username);
    await passwordTextbox.fill(password);

    const loginButtonZh = target.getByRole('button', { name: '登入' });
    if (await loginButtonZh.isVisible().catch(() => false)) {
      await loginButtonZh.click();
      return;
    }

    await passwordTextbox.press('Enter');
  }

  /** 依偏好語系先找欄位，找不到則 fallback（登入頁 combobox 可能預設英文） */
  private async resolveLoginFieldsOn(
    target: Page,
    preferred: LoginLocale,
  ): Promise<{ userTextbox: ReturnType<BpmLoginPage['userTextboxOn']>; passwordTextbox: ReturnType<BpmLoginPage['passwordTextboxOn']> }> {
    const order: LoginLocale[] = preferred === 'en' ? ['en', 'zh'] : ['zh', 'en'];

    for (const loc of order) {
      const userTextbox = this.userTextboxOn(target, loc);
      const passwordTextbox = this.passwordTextboxOn(target, loc);
      if ((await userTextbox.count()) === 0) {
        continue;
      }
      try {
        await expect(userTextbox).toBeVisible({ timeout: 5000 });
        await expect(passwordTextbox).toBeVisible({ timeout: 5000 });
        return { userTextbox, passwordTextbox };
      } catch {
        // 嘗試下一語系
      }
    }

    throw new Error(`找不到登入文字框（已嘗試語系: ${order.join(', ')}）。請確認頁面無障礙標籤是否變更。`);
  }

  private userTextboxOn(target: Page, locale: LoginLocale) {
    if (locale === 'en') {
      return target.getByRole('textbox', { name: 'LDAP User ID' });
    }
    return target
      .getByRole('textbox', { name: 'LDAP 代 號' })
      .or(target.getByRole('textbox', { name: 'LDAP 代号' }));
  }

  private passwordTextboxOn(target: Page, locale: LoginLocale) {
    if (locale === 'en') {
      return target.getByRole('textbox', { name: 'Password' });
    }
    return target
      .getByRole('textbox', { name: '密 碼' })
      .or(target.getByRole('textbox', { name: '密码' }));
  }
}
