CREATE TABLE fact_game (
    game_id             BIGINT PRIMARY KEY,
    started_at          TIMESTAMP,
    updated_at          TIMESTAMP,
    duration_seconds    INT,
    map_id              BIGINT,
    leaderboard_code    VARCHAR(32),
    kind                VARCHAR(32),
    patch_number        INT,
    server              VARCHAR(64),
    season              INT,
    ongoing             BOOLEAN DEFAULT FALSE,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at_row        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_fact_game_map FOREIGN KEY (map_id) REFERENCES dim_map(map_id),
    CONSTRAINT fk_fact_game_leaderboard FOREIGN KEY (leaderboard_code) REFERENCES dim_leaderboard(leaderboard_code),
    CONSTRAINT fk_fact_game_patch FOREIGN KEY (patch_number) REFERENCES dim_patch(patch_number)
);

CREATE INDEX idx_fact_game_started_at ON fact_game(started_at);
CREATE INDEX idx_fact_game_updated_at ON fact_game(updated_at);

CREATE TABLE fact_game_player (
    game_id             BIGINT NOT NULL,
    profile_id          BIGINT NOT NULL,
    civ_code            VARCHAR(64),
    team_index          INT,
    result              VARCHAR(16),
    rating              INT,
    rating_diff         INT,
    mmr                 INT,
    mmr_diff            INT,
    won                 BOOLEAN,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (game_id, profile_id),
    CONSTRAINT fk_fgp_game FOREIGN KEY (game_id) REFERENCES fact_game(game_id),
    CONSTRAINT fk_fgp_player FOREIGN KEY (profile_id) REFERENCES dim_player(profile_id),
    CONSTRAINT fk_fgp_civ FOREIGN KEY (civ_code) REFERENCES dim_civilization(civ_code)
);

CREATE INDEX idx_fgp_profile ON fact_game_player(profile_id);
CREATE INDEX idx_fgp_civ ON fact_game_player(civ_code);
