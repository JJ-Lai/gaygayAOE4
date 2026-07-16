CREATE TABLE dim_resource_type (
    resource_code    VARCHAR(32) PRIMARY KEY,
    display_name     VARCHAR(64) NOT NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO dim_resource_type (resource_code, display_name) VALUES
    ('food', 'Food'),
    ('wood', 'Wood'),
    ('gold', 'Gold'),
    ('stone', 'Stone'),
    ('oliveoil', 'Olive Oil'),
    ('total', 'Total');

CREATE TABLE dim_unit (
    pbgid            BIGINT PRIMARY KEY,
    entity_type      VARCHAR(32),
    icon             VARCHAR(512),
    display_name     VARCHAR(128),
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dim_building (
    pbgid            BIGINT PRIMARY KEY,
    entity_type      VARCHAR(32),
    icon             VARCHAR(512),
    display_name     VARCHAR(128),
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dim_technology (
    pbgid            BIGINT PRIMARY KEY,
    entity_type      VARCHAR(32),
    icon             VARCHAR(512),
    display_name     VARCHAR(128),
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
