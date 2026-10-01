export interface FairnessResult {
  overallScore: number;
  nightScore: number;
  weekendScore: number;
  holidayScore: number;
  workloadScore: number;
  details: FairnessDetailRow[];
}

export interface FairnessDetailRow {
  personnelId: string;
  personnelName: string;
  nightCount: number;
  weekendCount: number;
  holidayCount: number;
  totalHours: number;
  score: number;
}
