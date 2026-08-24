export * from "./auth"

export interface LeaderboardEntry {
  rank: number;
  team_id: string;
  team_name: string;
  total_score: number;
  tasks_completed: number;
}

export interface TaskLeaderboardEntry {
  rank: number;
  team_id: string;
  team_name: string;
  score: number | null;
  total_submissions: number;
  last_submission_at: string | null;
}

export interface Task {
  id: string;
  slug: string;
  name: string;
  submission_mode: "endpoint" | "code";
  is_active: boolean;
}

export interface Competition {
  id: string;
  slug: string;
  name: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
}
