import type { PmWorkItemRow } from './pm-work-item';

/** 預設三項工作項目（Excel 未填時的參考；實際執行以 Excel 為準） */
export const DEFAULT_PM_WORK_ITEMS: readonly PmWorkItemRow[] = [
  { num: '1', name: '(軟體)軟體建置開發及測試', hour: '100', alarmHour: '100' },
  { num: '2', name: '(軟體)專案庶務及聯繫', hour: '100', alarmHour: '100' },
  { num: '3', name: '(協作單位)專案執行', hour: '100', alarmHour: '100' },
] as const;
