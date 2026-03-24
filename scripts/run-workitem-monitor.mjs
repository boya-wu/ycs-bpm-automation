import { spawn } from 'node:child_process';
import { mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const LOG_DIR = path.join(ROOT, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'workitem-monitor.log');

function nowIsoLocal() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function extractMetric(text, label, options = { numericOnly: true }) {
  const re = new RegExp(`${label}:\\s*(.+)`);
  const match = text.match(re);
  const raw = match?.[1]?.trim() ?? '';
  if (!options.numericOnly) {
    return raw;
  }
  const numberOnly = raw.match(/\d+/)?.[0];
  return numberOnly ?? '';
}

function extractFailureReason(stdout, stderr) {
  const all = `${stderr}\n${stdout}`.split('\n').map((s) => s.trim()).filter(Boolean);
  const errorLine =
    all.find((line) => line.startsWith('Error:')) ||
    all.find((line) => line.includes('FAILED')) ||
    all.find((line) => line.includes('failed')) ||
    all.find((line) => line.includes('timeout'));
  if (errorLine) {
    return errorLine;
  }
  return all.slice(-1)[0] || 'unknown error';
}

async function main() {
  const startedAt = Date.now();
  const projectCode = process.env.BPM_TARGET_PROJECT_CODE?.trim() || 'DY23-0742';

  const cmd =
    process.platform === 'win32'
      ? 'npx playwright test tests/bpm-workitemCheck.spec.ts --project=chromium'
      : 'npx playwright test tests/bpm-workitemCheck.spec.ts --project=chromium';
  const child = spawn(cmd, { cwd: ROOT, shell: true, env: process.env });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });

  const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  const formsChecked = extractMetric(stdout, '工時申請單明細已開啟並檢查');
  const workItemFilled = extractMetric(stdout, '#WorkItem_txt 有內容（非空白）');
  const exemptByWorkDesc = extractMetric(stdout, '工作說明含「無 workitem」而豁免內容檢查');
  const popupVerified = extractMetric(stdout, '退回成功（popup 訊號）');
  const worklistVerified = extractMetric(stdout, '退回成功（清單前綴）');
  const returnCount = extractMetric(stdout, '退回成功後置驗證通過') || extractMetric(stdout, '已執行退回筆數');
  const returnListRaw =
    extractMetric(stdout, '已驗證退回清單', { numericOnly: false }) ||
    extractMetric(stdout, '已執行退回清單', { numericOnly: false });
  const returnList = returnListRaw && returnListRaw !== '（無）' ? returnListRaw : '';

  let line = '';
  if (exitCode === 0) {
    line =
      `[${nowIsoLocal()}] OK project=${projectCode} checked=${formsChecked || '0'} filled=${workItemFilled || '0'} ` +
      `exempt=${exemptByWorkDesc || '0'} return=${returnCount || '0'} popup=${popupVerified || '0'} ` +
      `worklist=${worklistVerified || '0'} duration=${durationSec}s`;
    console.log(line);
    if (returnList) {
      console.log(`[${nowIsoLocal()}] RETURNED_LIST ${returnList}`);
    }
  } else {
    const reason = extractFailureReason(stdout, stderr);
    line = `[${nowIsoLocal()}] FAIL project=${projectCode} reason="${reason.replace(/"/g, "'")}" duration=${durationSec}s`;
    console.error(line);
  }

  await mkdir(LOG_DIR, { recursive: true });
  await appendFile(LOG_FILE, `${line}\n`, 'utf-8');
  if (exitCode === 0 && returnList) {
    await appendFile(LOG_FILE, `[${nowIsoLocal()}] RETURNED_LIST ${returnList}\n`, 'utf-8');
  }

  process.exit(exitCode);
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  const line = `[${nowIsoLocal()}] FAIL project=${process.env.BPM_TARGET_PROJECT_CODE?.trim() || 'DY23-0742'} reason="${message.replace(/"/g, "'")}" duration=0.0s`;
  console.error(line);
  try {
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(LOG_FILE, `${line}\n`, 'utf-8');
  } catch {
    // Ignore logging failure here; exit code is primary signal.
  }
  process.exit(1);
});
