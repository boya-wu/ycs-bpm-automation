import { expect, type Locator, type Page } from '@playwright/test';

type PageInfo = {
  currentPage: number;
  totalPages: number;
};

export class BpmWorklistPage {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  private get functionFrame() {
    return this.page.frameLocator('iframe[name="ifmFucntionLocation"]');
  }

  async waitUntilReady(options?: { timeout?: number }): Promise<void> {
    await expect(this.functionFrame.locator('#lblPcPageInfo')).toBeVisible({
      timeout: options?.timeout ?? 15_000,
    });
  }

  /** 從表單明細返回待辦清單（明細頁無 #lblPcPageInfo，需先點返回） */
  async backToWorkListFromDetailIfVisible(): Promise<void> {
    const frame = this.functionFrame;

    if (await frame.locator('#lblPcPageInfo').isVisible()) {
      return;
    }

    const backByA11y = frame.locator('[aria-label="Back To Work List"], [title="Back To Work List"]');
    const backByCell = frame
      .getByRole('cell', { name: /Back To Work List/i })
      .getByText('Back To Work List', { exact: true });
    const backZh = frame.getByRole('cell', { name: /返回工作清單/ }).getByText('返回工作清單', { exact: true });

    const back = backByA11y.or(backByCell).or(backZh);

    await expect(back.first()).toBeVisible({ timeout: 15_000 });
    await back.first().click();
    await this.waitUntilReady({ timeout: 30_000 });
  }

  async setPageSizeTo100IfAvailable(): Promise<void> {
    const pageSizeButton = this.functionFrame.getByRole('button', { name: '100' });
    if ((await pageSizeButton.count()) > 0) {
      await pageSizeButton.first().click();
      await this.waitUntilReady();
    }
  }

  async getProcessCellCountInCurrentPage(processName: string): Promise<number> {
    return await this.getProcessRowsInCurrentPage(processName).count();
  }

  async getProcessCellCountByProjectCodeInCurrentPage(processName: string, projectCode: string): Promise<number> {
    return await this.getProcessRowsByProjectCodeInCurrentPage(processName, projectCode).count();
  }

  async openProcessByIndex(processName: string, index: number): Promise<void> {
    const targetRow = this.getProcessRowsInCurrentPage(processName).nth(index);
    const targetCell = targetRow.getByRole('cell', { name: processName, exact: true }).first();
    await expect(targetCell).toBeVisible();
    await targetCell.click();
  }

  async openProcessByProjectCodeIndex(processName: string, projectCode: string, index: number): Promise<void> {
    const targetRow = this.getProcessRowsByProjectCodeInCurrentPage(processName, projectCode).nth(index);
    const targetCell = targetRow.getByRole('cell', { name: processName, exact: true }).first();
    await expect(targetCell).toBeVisible();
    await targetCell.click();
  }

  /**
   * 以「資料列」為單位過濾流程，避免直接用 cell.nth() 命中重複/隱藏節點造成同筆被重點。
   */
  private getProcessRowsInCurrentPage(processName: string): Locator {
    return this.functionFrame
      .locator('tr')
      .filter({
        has: this.functionFrame.getByRole('cell', { name: processName, exact: true }),
      })
      .filter({
        hasNot: this.functionFrame.getByRole('columnheader'),
      });
  }

  /**
   * 只保留同一列 Process Subject 內含「專案代碼:{projectCode}」的工時申請單。
   */
  private getProcessRowsByProjectCodeInCurrentPage(processName: string, projectCode: string): Locator {
    const token = `專案代碼:${projectCode}`;
    return this.getProcessRowsInCurrentPage(processName).filter({
      hasText: token,
    });
  }

  async getPageInfo(): Promise<PageInfo> {
    const el = this.functionFrame.locator('#lblPcPageInfo');
    const inner = (await el.innerText().catch(() => '')) || ((await el.textContent()) ?? '');
    const pageInfoText = inner.trim();

    /**
     * 常見格式：「1 / 1 , 4」= 第 1 頁、共 1 頁、4 筆；若只取數字 [1,4] 會誤判成 4 頁。
     */
    const threePart = pageInfoText.match(/(\d+)\s*\/\s*(\d+)\s*,\s*(\d+)/);
    if (threePart) {
      return {
        currentPage: Number.parseInt(threePart[1], 10),
        totalPages: Number.parseInt(threePart[2], 10),
      };
    }

    /** 僅「/ 總頁 , 筆數」時，目前頁由內嵌 input 讀取 */
    const tail = pageInfoText.match(/\/\s*(\d+)\s*,\s*(\d+)\s*$/);
    if (tail) {
      const totalPages = Number.parseInt(tail[1], 10);
      const pageInput = el.locator('input').first();
      if ((await pageInput.count()) > 0) {
        const raw = (await pageInput.inputValue()).trim();
        const currentPage = raw ? Number.parseInt(raw, 10) : 1;
        if (!Number.isNaN(currentPage) && !Number.isNaN(totalPages)) {
          return { currentPage, totalPages };
        }
      }
      if (!Number.isNaN(totalPages)) {
        return { currentPage: 1, totalPages };
      }
    }

    const slashMatch = pageInfoText.match(/(\d+)\s*\/\s*(\d+)/);
    if (slashMatch) {
      const currentPage = Number.parseInt(slashMatch[1], 10);
      const totalPages = Number.parseInt(slashMatch[2], 10);
      if (!Number.isNaN(currentPage) && !Number.isNaN(totalPages)) {
        return { currentPage, totalPages };
      }
    }

    const numbers = pageInfoText.match(/\d+/g)?.map((value) => Number.parseInt(value, 10)) ?? [];
    if (numbers.length < 2 || Number.isNaN(numbers[0]) || Number.isNaN(numbers[1])) {
      throw new Error(`無法解析頁碼資訊: "${pageInfoText}"`);
    }

    return { currentPage: numbers[0], totalPages: numbers[1] };
  }

  async goToNextPageIfPossible(): Promise<boolean> {
    const before = await this.getPageInfo();
    if (before.currentPage >= before.totalPages) {
      return false;
    }

    const nextCandidates: Locator[] = [
      this.functionFrame.getByRole('button', { name: '下一頁' }),
      this.functionFrame.getByRole('link', { name: '下一頁' }),
      this.functionFrame.getByRole('button', { name: '>' }),
      this.functionFrame.getByRole('link', { name: '>' }),
      this.functionFrame.getByRole('button', { name: 'Next' }),
      this.functionFrame.getByRole('link', { name: 'Next' }),
      this.functionFrame.locator('[title="下一頁"], [title="Next"], [aria-label="下一頁"], [aria-label="Next"]'),
      this.functionFrame.locator(
        '#imgBtnNext, #btnPcNext, #lblPcNext, a[id*="Next" i], input[type="button"][value*="Next" i]',
      ),
    ];

    for (const candidate of nextCandidates) {
      if ((await candidate.count()) === 0) {
        continue;
      }

      await candidate.first().click();
      await expect
        .poll(async () => {
          const info = await this.getPageInfo();
          return info.currentPage;
        })
        .toBeGreaterThan(before.currentPage);

      return true;
    }

    throw new Error('有下一頁但找不到「下一頁」控制元件');
  }
}
