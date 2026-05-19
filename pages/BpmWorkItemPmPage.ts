import { expect, type Page } from '@playwright/test';

import type { PmWorkItemRow } from '../data/default-pm-work-items';

/**
 * 工時 PM 設定頁（CustomOpenWin/工時PM.jsp 或 PMSetting.aspx）。
 * 欄位以 id 為主（舊版 ASP.NET 表單無完整 a11y 標籤）。
 */
export class BpmWorkItemPmPage {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  private get projectInput() {
    return this.page.locator('#txtProject');
  }

  private get pmEmpInput() {
    return this.page.locator('#txtPMEmp');
  }

  private get numInput() {
    return this.page.locator('#txtNum');
  }

  private get workItemInput() {
    return this.page.locator('#txtWorkItem');
  }

  private get hourInput() {
    return this.page.locator('#txtHour');
  }

  private get alarmHourInput() {
    return this.page.locator('#txtAlarmHour');
  }

  async open(url: string): Promise<void> {
    await this.page.goto(url);
    await expect(this.projectInput).toBeVisible({ timeout: 30_000 });
  }

  async searchProject(projectCode: string): Promise<void> {
    await expect(this.projectInput).toBeVisible();
    await this.projectInput.fill(projectCode);
    await this.page.locator('#btnSearch').click();
    await this.page.waitForLoadState('networkidle');
  }

  /** 查詢結果為「無相關資料」代表專案 PM 對應尚未建立 */
  async isProjectMissing(): Promise<boolean> {
    return this.page.getByRole('cell', { name: '無相關資料' }).isVisible();
  }

  async expectProjectExists(projectCode: string): Promise<void> {
    await expect(this.page.getByRole('cell', { name: '無相關資料' })).toBeHidden();
    await expect(this.page.locator('#gvPM').getByText(projectCode, { exact: true })).toBeVisible();
  }

  async createProjectPmMapping(projectCode: string, pmEmpId: string): Promise<void> {
    await expect(this.page.getByRole('cell', { name: '無相關資料' })).toBeVisible();
    await this.projectInput.fill(projectCode);
    await this.pmEmpInput.fill(pmEmpId);
    this.page.once('dialog', (dialog) => void dialog.accept());
    await this.page.locator('#btnAdd').click();
    await this.page.waitForLoadState('networkidle');
    await expect(this.page.getByRole('cell', { name: '無相關資料' })).toBeHidden({ timeout: 15_000 });
  }

  async openWorkItemEditor(projectCode: string): Promise<void> {
    const projectRow = this.page.locator('#gvPM tr').filter({ hasText: projectCode });
    await projectRow.getByRole('button', { name: 'WorkItem' }).click();
    await this.page.waitForLoadState('networkidle');
    await expect(this.numInput).toBeVisible({ timeout: 15_000 });
  }

  async addWorkItemRow(row: PmWorkItemRow): Promise<void> {
    await this.numInput.fill(row.num);
    await this.workItemInput.fill(row.name);
    await this.hourInput.fill(row.hour);
    await this.alarmHourInput.fill(row.alarmHour);
    await this.page.getByRole('button', { name: '新 增' }).click();
    await expect(this.numInput).toBeVisible();
  }
}
