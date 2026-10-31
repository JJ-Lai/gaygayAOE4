CREATE TABLE fact_player_combat_stats (
    game_id         BIGINT NOT NULL,
    profile_id      BIGINT NOT NULL,
    buildings_lost  INT,
    units_lost      INT,
    unit_kills      INT,
    squad_kills     INT,
    enemy_deaths    INT,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (game_id, profile_id),
    CONSTRAINT fk_combat_game FOREIGN KEY (game_id) REFERENCES fact_game(game_id),
    CONSTRAINT fk_combat_player FOREIGN KEY (profile_id) REFERENCES dim_player(profile_id)
);

CREATE INDEX idx_combat_profile ON fact_player_combat_stats(profile_id);
