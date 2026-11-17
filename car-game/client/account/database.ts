export type ProfileRow = {
  user_id: string;
  nickname: string;
  avatar_url: string | null;
  created_at: string;
};

export type RaceStatsRow = {
  user_id: string;
  races: number;
  wins: number;
  best_finish: number | null;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Omit<ProfileRow, 'created_at'> & { created_at?: string };
        Update: Partial<Omit<ProfileRow, 'user_id' | 'created_at'>>;
        Relationships: [];
      };
      race_stats: {
        Row: RaceStatsRow;
        Insert: Omit<RaceStatsRow, 'updated_at'> & { updated_at?: string };
        Update: Partial<Omit<RaceStatsRow, 'user_id'>>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      record_race_result: {
        Args: { finish_position: number };
        Returns: RaceStatsRow;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
