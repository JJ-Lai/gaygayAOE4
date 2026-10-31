CREATE TABLE raw_game_summary (
    game_id          BIGINT PRIMARY KEY,
    profile_id       BIGINT NOT NULL,
    payload          CLOB NOT NULL,
    summary_version  INT,
    fetch_status     VARCHAR(16) NOT NULL,
    error_message    VARCHAR(512),
    fetched_at       TIMESTAMP NOT NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_rgs_game FOREIGN KEY (game_id) REFERENCES fact_game(game_id),
    CONSTRAINT fk_rgs_player FOREIGN KEY (profile_id) REFERENCES dim_player(profile_id)
);

CREATE INDEX idx_rgs_profile ON raw_game_summary(profile_id);
CREATE INDEX idx_rgs_status ON raw_game_summary(fetch_status);
