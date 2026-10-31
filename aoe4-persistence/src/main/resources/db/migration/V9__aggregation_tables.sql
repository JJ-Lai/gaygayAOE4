CREATE TABLE agg_player_civ_stats (
    profile_id        BIGINT NOT NULL,
    leaderboard_code  VARCHAR(32) NOT NULL,
    civ_code          VARCHAR(64) NOT NULL,
    games             BIGINT NOT NULL,
    wins              BIGINT NOT NULL,
    losses            BIGINT NOT NULL,
    refreshed_at      TIMESTAMP NOT NULL,
    PRIMARY KEY (profile_id, leaderboard_code, civ_code)
);

CREATE INDEX idx_agg_pcs_profile ON agg_player_civ_stats(profile_id);

CREATE TABLE agg_matchup_matrix (
    profile_id        BIGINT NOT NULL,
    leaderboard_code  VARCHAR(32) NOT NULL,
    player_civ        VARCHAR(64) NOT NULL,
    opponent_civ      VARCHAR(64) NOT NULL,
    games             BIGINT NOT NULL,
    wins              BIGINT NOT NULL,
    losses            BIGINT NOT NULL,
    military_diff_sum DOUBLE,
    refreshed_at      TIMESTAMP NOT NULL,
    PRIMARY KEY (profile_id, leaderboard_code, player_civ, opponent_civ)
);

CREATE INDEX idx_agg_mm_profile ON agg_matchup_matrix(profile_id);

CREATE TABLE agg_resource_timeline (
    profile_id        BIGINT NOT NULL,
    leaderboard_code  VARCHAR(32) NOT NULL,
    civ_code          VARCHAR(64) NOT NULL,
    minute_index      INT NOT NULL,
    resource_code     VARCHAR(32) NOT NULL,
    avg_value         DOUBLE NOT NULL,
    game_count        BIGINT NOT NULL,
    refreshed_at      TIMESTAMP NOT NULL,
    PRIMARY KEY (profile_id, leaderboard_code, civ_code, minute_index, resource_code)
);

CREATE INDEX idx_agg_rt_profile ON agg_resource_timeline(profile_id);
