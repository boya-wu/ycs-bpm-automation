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
    const { userTextbox, passwordTextbox } = await this.resolveLoginFields(locale);

    await userTextbox.click();
    await userTextbox.fill(username);
    await passwordTextbox.fill(password);
    await passwordTextbox.press('Enter');

    await expect(this.page.locator('iframe[name="ifmFucntionLocation"]')).toBeVisible();
  }

  /** 依偏好語系先找欄位，找不到則 fallback（登入頁 combobox 可能預設英文） */
  private async resolveLoginFields(
    preferred: LoginLocale,
  ): Promise<{ userTextbox: ReturnType<BpmLoginPage['resolveUserTextbox']>; passwordTextbox: ReturnType<BpmLoginPage['resolvePasswordTextbox']> }> {
    const order: LoginLocale[] = preferred === 'en' ? ['en', 'zh'] : ['zh', 'en'];

    for (const loc of order) {
      const userTextbox = this.resolveUserTextbox(loc);
      const passwordTextbox = this.resolvePasswordTextbox(loc);
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

  private resolveUserTextbox(locale: LoginLocale) {
    if (locale === 'en') {
      return this.page.getByRole('textbox', { name: 'LDAP User ID' });
    }
    return this.page
      .getByRole('textbox', { name: 'LDAP 代 號' })
      .or(this.page.getByRole('textbox', { name: 'LDAP 代号' }));
  }

  private resolvePasswordTextbox(locale: LoginLocale) {
    if (locale === 'en') {
      return this.page.getByRole('textbox', { name: 'Password' });
    }
    return this.page
      .getByRole('textbox', { name: '密 碼' })
      .or(this.page.getByRole('textbox', { name: '密码' }));
  }
}
