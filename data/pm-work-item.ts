/** 單筆 PM WorkItem（對應 BPM 表單欄位） */
export type PmWorkItemRow = {
  num: string;
  name: string;
  hour: string;
  alarmHour: string;
};

/** 一個專案及其 WorkItem 清單（由 Excel 一組列彙整） */
export type PmWorkItemBatch = {
  projectCode: string;
  pmEmpId: string;
  workItems: readonly PmWorkItemRow[];
};
