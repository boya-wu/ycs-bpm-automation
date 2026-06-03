import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://efgp.yuchens.com:8086/NaNaWeb/GP//ForwardIndex?hdnMethod=findIndexForward');
  await page.getByRole('combobox').selectOption('zh_TW');
  await page.getByRole('textbox', { name: 'LDAP 代 號' }).click();
  await page.getByRole('textbox', { name: 'LDAP 代 號' }).fill('boyawu');
  await page.getByRole('textbox', { name: '密 碼' }).fill('qwertyuiop[]');
  await page.getByRole('button', { name: '登入' }).click();
  await page.locator('iframe[name="ifmNavigator"]').contentFrame().locator('i').nth(3).click();
  await page.locator('iframe[name="ifmFucntionLocation"]').contentFrame().getByRole('textbox', { name: '查詢流程名稱' }).click();
  await page.locator('iframe[name="ifmFucntionLocation"]').contentFrame().getByRole('textbox', { name: '查詢流程名稱' }).fill('工時申請單');
  await page.locator('iframe[name="ifmFucntionLocation"]').contentFrame().getByRole('button').click();
  await page.locator('iframe[name="ifmFucntionLocation"]').contentFrame().getByRole('img').click();
  const page1Promise = page.waitForEvent('popup');
  await page.locator('iframe[name="ifmFucntionLocation"]').contentFrame().locator('iframe[name="ifmAppLocation"]').contentFrame().locator('#ProjNoDiaglog_btn').click();
  const page1 = await page1Promise;
  await page1.getByRole('link').click();
  await page1.locator('[id="_cuzDataChooser_criteria_0"]').click();
  await page1.locator('[id="_cuzDataChooser_criteria_0"]').fill('DY23-0742');
  await page1.getByRole('button', { name: '搜尋' }).click();
  await page1.getByRole('cell', { name: '莊旭偉' }).click();
  const page2Promise = page.waitForEvent('popup');
  await page.locator('iframe[name="ifmFucntionLocation"]').contentFrame().locator('iframe[name="ifmAppLocation"]').contentFrame().locator('#WorkItem_btn').click();
  const page2 = await page2Promise;
  await page2.getByRole('cell', { name: '教育訓練(Education Training)' }).click();
  await page.locator('iframe[name="ifmFucntionLocation"]').contentFrame().locator('iframe[name="ifmAppLocation"]').contentFrame().locator('#WorkDate_btn').click();
  // 設定報工日期
  await page.locator('iframe[name="ifmFucntionLocation"]').contentFrame().locator('iframe[name="ifmAppLocation"]').contentFrame().getByText('13').click();
  // 填入工時
  await page.locator('iframe[name="ifmFucntionLocation"]').contentFrame().locator('iframe[name="ifmAppLocation"]').contentFrame().locator('#WorkHour').click();
  await page.locator('iframe[name="ifmFucntionLocation"]').contentFrame().locator('iframe[name="ifmAppLocation"]').contentFrame().locator('#WorkHour').fill('8');
  // 填入工作說明
  await page.locator('iframe[name="ifmFucntionLocation"]').contentFrame().locator('iframe[name="ifmAppLocation"]').contentFrame().locator('#WorkDesc').click();
  await page.locator('iframe[name="ifmFucntionLocation"]').contentFrame().locator('iframe[name="ifmAppLocation"]').contentFrame().locator('#WorkDesc').fill('自動報工測試');
  await page.locator('iframe[name="ifmFucntionLocation"]').contentFrame().getByTitle('發起').click();
  // 確認發起成功
  await page.locator('iframe[name="ifmFucntionLocation"]').contentFrame().getByText('你的流程已經發起成功了!').click();
  // 流程代號暫時用不到
  // await page.locator('iframe[name="ifmFucntionLocation"]').contentFrame().getByText('[PKG1548730080895100361757]').click();
});