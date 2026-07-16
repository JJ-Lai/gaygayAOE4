DELETE FROM fact_build_event WHERE game_id IN (91001, 91002);
DELETE FROM fact_game_player_resource WHERE game_id IN (91001, 91002);
DELETE FROM fact_game_player_army_value WHERE game_id IN (91001, 91002);
DELETE FROM fact_game_player WHERE game_id IN (91001, 91002);
DELETE FROM fact_game WHERE game_id IN (91001, 91002);
DELETE FROM dim_player WHERE profile_id IN (10861747, 999999, 888888);
DELETE FROM dim_civilization WHERE civ_code IN ('english', 'french', 'chinese');

INSERT INTO dim_civilization (civ_code, civ_name) VALUES
    ('english', 'English'),
    ('french', 'French'),
    ('chinese', 'Chinese');

INSERT INTO dim_player (profile_id, name, country) VALUES
    (10861747, 'Integration Test Player', 'tw'),
    (999999, 'Opponent Player', 'tw'),
    (888888, 'Second Opponent', 'tw');

INSERT INTO fact_game (game_id, started_at, leaderboard_code, created_at, updated_at_row)
VALUES
    (91001, TIMESTAMP '2024-06-01 12:00:00', 'rm_2v2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (91002, TIMESTAMP '2024-06-02 12:00:00', 'rm_1v1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO fact_game_player (game_id, profile_id, civ_code, result, won, team_index, created_at, updated_at)
VALUES
    (91001, 10861747, 'english', 'win', TRUE, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (91001, 999999, 'french', 'loss', FALSE, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (91001, 888888, 'chinese', 'loss', FALSE, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (91002, 10861747, 'english', 'loss', FALSE, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (91002, 999999, 'french', 'win', TRUE, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO fact_game_player_resource (game_id, profile_id, resource_code, second_mark, series_index, minute_index, accumulated_value, per_minute_value, created_at)
VALUES
    (91001, 10861747, 'food', 0, 0, 0, 100, NULL, CURRENT_TIMESTAMP),
    (91001, 10861747, 'food', 300, 1, 5, 500, 80, CURRENT_TIMESTAMP),
    (91001, 999999, 'food', 0, 0, 0, 90, NULL, CURRENT_TIMESTAMP),
    (91001, 999999, 'food', 300, 1, 5, 420, 66, CURRENT_TIMESTAMP),
    (91001, 888888, 'food', 0, 0, 0, 70, NULL, CURRENT_TIMESTAMP);

INSERT INTO fact_game_player_army_value (game_id, profile_id, second_mark, series_index, minute_index, army_value, created_at)
VALUES
    (91001, 10861747, 0, 0, 0, 200, CURRENT_TIMESTAMP),
    (91001, 999999, 0, 0, 0, 180, CURRENT_TIMESTAMP);

INSERT INTO fact_build_event (game_id, profile_id, event_second, entity_type, pbgid, event_kind, created_at)
VALUES
    (91001, 10861747, 120, 'unit', 1001, 'FINISHED', CURRENT_TIMESTAMP),
    (91001, 999999, 180, 'unit', 1002, 'CONSTRUCTED', CURRENT_TIMESTAMP),
    (91001, 888888, 240, 'unit', 1003, 'FINISHED', CURRENT_TIMESTAMP);
