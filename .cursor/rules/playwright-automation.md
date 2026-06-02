# Context
本專案為使用 Playwright 自動化操控 Legacy WebForm 的專用技術說明書。

# 技術實現規範
1. 密室地圖帳本：
   本系統高度依賴多層 Iframe 嵌套。在編寫 `page.evaluate()` 內部邏輯時，必須依據以下 Iframe 地圖絕對路徑作為起手式，禁止直接使用全域 `document`：
   `const doc = window.frames['ifmFucntionLocation']?.frames['ifmAppLocation']?.document;`

2. Console 聖旨原則：
   當使用者提供在 F12 Console 嘗試成功的原生 JS 語法時，禁止將其改寫。你唯一的任務是將其包裹進 `page.evaluate()` 中，並將裡面的硬編碼參數替換為動態變數。

3. 唯讀與隱藏欄位處理：
   - 優先使用專案既有模式與 Playwright 標準 Locator。
   - 只有當 Locator 經驗證確定失敗，或元素屬於特殊的 `readonly`（需解除 readOnly 限制）、`hidden` 隱藏欄位、DWR 動態控制項、或兩層以上的巢狀 iframe 時，才允許使用 `page.evaluate()` 注入原生 JS 爆破填值。
   - 注入填值後必須觸發全套變更事件：`input.dispatchEvent(new Event('change', { bubbles: true }));`

4. 非同步與彈窗等候策略：
   嚴格禁止使用固定的 `page.waitForTimeout()`。必須根據實際網頁行為選擇：
   - 真 Popup (新視窗/新分頁) ──> 使用 `page.waitForEvent('popup')`。
   - Fake Popup (網頁內嵌 Modal/Div 遮罩) ──> 使用 `page.waitForSelector()`。
   - AJAX / DWR 表格加載 ──> 使用 `page.waitForResponse()`，或在 `popup.evaluate()` 內使用 `setInterval` 輪詢特定元素是否渲染成功。
