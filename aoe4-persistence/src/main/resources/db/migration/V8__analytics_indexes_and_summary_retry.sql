CREATE INDEX idx_fgp_profile_civ ON fact_game_player(profile_id, civ_code);
CREATE INDEX idx_fgp_profile_game ON fact_game_player(profile_id, game_id);
CREATE INDEX idx_fact_game_leaderboard_started ON fact_game(leaderboard_code, started_at);

ALTER TABLE raw_game_summary ADD COLUMN retry_count INT NOT NULL DEFAULT 0;
