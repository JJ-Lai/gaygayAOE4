DELETE FROM fact_game_player_resource;
DELETE FROM fact_game_player_army_value;
DELETE FROM fact_build_event;
DELETE FROM fact_game_player_score;
DELETE FROM raw_game_summary;

ALTER TABLE fact_game_player_resource ADD COLUMN series_index INT NOT NULL DEFAULT 0;

ALTER TABLE fact_game_player_resource DROP CONSTRAINT uq_fpr;
ALTER TABLE fact_game_player_resource ADD CONSTRAINT uq_fpr
    UNIQUE (game_id, profile_id, resource_code, series_index);

ALTER TABLE fact_game_player_army_value ADD COLUMN series_index INT NOT NULL DEFAULT 0;

ALTER TABLE fact_game_player_army_value DROP CONSTRAINT uq_fpav;
ALTER TABLE fact_game_player_army_value ADD CONSTRAINT uq_fpav
    UNIQUE (game_id, profile_id, series_index);
