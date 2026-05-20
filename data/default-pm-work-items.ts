/** 工時 PM 頁面預設建立的 5 筆 WorkItem（與 codegen 錄製一致） */
export type PmWorkItemRow = {
  num: string;
  name: string;
  hour: string;
  alarmHour: string;
};

export const DEFAULT_PM_WORK_ITEMS: readonly PmWorkItemRow[] = [
  { num: '1', name: '專案庶務及聯繫', hour: '100', alarmHour: '100' },
  { num: '2', name: '軟體建置開發及測試', hour: '100', alarmHour: '100' },
  { num: '3', name: '硬體施工、廠勘釐清', hour: '24', alarmHour: '16' },
  { num: '4', name: '專案請款、業主聯繫追蹤', hour: '160', alarmHour: '100' },
  { num: '5', name: '料件選型、詢價及請購相關', hour: '111', alarmHour: '111' },
] as const;
