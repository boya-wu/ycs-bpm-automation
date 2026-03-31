# Windows 佈署懶人包（Git Bash + Playwright）

目標：把這個專案在 Windows 上「一次裝好、之後用排程自動跑」。

> 你只需要照做，不需要懂 Playwright 細節。

---

## 0. 你需要準備什麼

- **Windows 10/11**
- **Git for Windows（內含 Git Bash）**
- **Node.js（建議 LTS 版本）**
- （選配）**Python 3**：本專案主要用 Node/Playwright，Python 不是必需；但公司環境常會需要 Python 做額外的小工具，所以這份懶人包也附上安裝方式。

---

## 1. 安裝 Node.js（必需）

1. 到 Node.js 官網下載 **LTS** 並安裝
2. 安裝完成後開啟 **Git Bash**，確認版本：

```bash
node -v
npm -v
```

看到版本號就代表 OK。

---

## 2. 安裝 Python 3（選配）

1. 到 Python 官網下載 Python 3.x（建議 3.11+）
2. 安裝時務必勾選 **Add python.exe to PATH**
3. 用 Git Bash 檢查：

```bash
python --version || py --version
pip --version || py -m pip --version
```

> 若你只看到 `py` 有版本、`python` 沒有，也沒關係（Windows 常見）。

### 2.1 Python 套件安裝（選配）

本 repo 目前 **沒有** `requirements.txt` / `pyproject.toml`，所以通常不需要跑 `pip install`。

但如果你之後新增了 Python 工具，建議流程是：

```bash
# 在專案根目錄
python -m venv .venv || py -m venv .venv

# Git Bash 啟用 venv（Windows）
source .venv/Scripts/activate

# 安裝依賴（若你有 requirements.txt）
pip install -r requirements.txt
```

---

## 3. 下載專案（第一次）

在 Git Bash 進到你要放專案的資料夾後：

```bash
git clone <你的 repo URL>
cd ycs-bpm-automation
```

> 路徑示例一律用 `/`：像 `/c/Users/Administrator/Documents/GitHub/ycs-bpm-automation`

---

## 4. 設定環境變數（必需）

本專案會從專案根目錄的 `.env` 讀設定。

1. 複製範本：

```bash
cp .env.example .env
```

1. 用你習慣的編輯器打開 `.env`，至少要填：

- `PLAYWRIGHT_BPM_USER`
- `PLAYWRIGHT_BPM_PASSWORD`
- （建議）`BPM_TARGET_PROJECT_CODE`

> **不要**把 `.env` 提交到 git（裡面有密碼）。

---

## 5. 安裝套件（第一次 / 有更新時）

在專案根目錄執行：

```bash
npm ci || npm install
npx playwright install
```

說明：

- `npm ci`：最穩定（有 lockfile 時）。如果失敗再用 `npm install`。
- `npx playwright install`：下載瀏覽器（Chromium/Firefox/WebKit）。

---

## 6. 手動跑一次（確認能動）

### A) 跑「workitem 檢查」測試（單次）

```bash
npm run test:workitem-check
```

### B) 跑「monitor」模式（適合排程）

```bash
npm run monitor:workitem
```

成功/失敗都會寫入：

- `./logs/workitem-monitor.log`

---

## 7. 一鍵腳本（建議用）

我已經放了 Git Bash 腳本在 `./scripts/`：

- `./scripts/bootstrap-windows.sh`：第一次/更新時安裝依賴
- `./scripts/run-monitor.sh`：跑一次 monitor（排程就是跑這個）

使用方法（在專案根目錄）：

```bash
bash ./scripts/bootstrap-windows.sh
bash ./scripts/run-monitor.sh
```

---

## 8. Windows 工作排程器（Task Scheduler）設定

目標：每天固定時間自動跑 `run-monitor.sh`，把結果記錄到 `logs/workitem-monitor.log`。

### 8.1 找到 Git Bash 的 bash.exe

常見位置（擇一）：

- `C:/Program Files/Git/bin/bash.exe`
- `C:/Program Files/Git/usr/bin/bash.exe`

你可以在檔案總管搜尋 `bash.exe`。

> 小提醒：有些環境 **不會把 bash 加到 PATH**，所以你在終端機打 `bash` 可能會「找不到指令」；排程器也一樣。這時候就用上面這種「完整路徑」指定即可。

### 8.2 建立排程

1. 打開「**工作排程器**」
2. 右側按「**建立工作**」（不要用「基本工作」，設定比較完整）
3. **一般** 分頁
  - 名稱：`ycs-bpm-workitem-monitor`
  - 勾選：**不論使用者是否登入都要執行**
  - 勾選：**以最高權限執行**（公司電腦常需要）
4. **觸發程序** 分頁
  - 新增：每天 / 每 10 分鐘一次 / 你想要的頻率
5. **動作** 分頁 → 新增
  - **程式或指令碼**：填你的 bash.exe（例如 `C:/Program Files/Git/bin/bash.exe`）
  - **新增引數**（重要，整段照貼，改路徑）：

```bash
-lc "cd /c/Users/Administrator/Documents/GitHub/ycs-bpm-automation && bash ./scripts/run-monitor.sh"
```

1. **條件/設定** 分頁
  - 若是筆電：可取消「只有在使用 AC 電源時才啟動」
  - 建議勾「如果工作執行時間超過…則停止」（例如 30 分鐘），避免卡死

### 8.3 測試排程是否成功

在工作排程器右鍵該工作 → **執行**，然後回到專案資料夾檢查：

- `./logs/workitem-monitor.log` 是否新增一行

---

## 9. 常見問題（最常踩）

- **排程跑不起來但手動可以**
  - 通常是「工作目錄」不對，所以我建議用 `-lc "cd ... && ..."` 這種寫法。
- **找不到瀏覽器 / Playwright 失敗**
  - 重跑：

```bash
npx playwright install
```

- **密碼含特殊字元**
  - `.env` 建議用雙引號包起來：`PLAYWRIGHT_BPM_PASSWORD="p@ss word!"`

