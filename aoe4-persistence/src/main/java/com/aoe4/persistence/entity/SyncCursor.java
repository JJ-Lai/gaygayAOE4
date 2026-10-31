package com.aoe4.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "sync_cursor")
public class SyncCursor {

    @Id
    @Column(name = "cursor_key")
    private String cursorKey;

    private String endpoint;

    @Column(name = "last_updated_since")
    private Instant lastUpdatedSince;

    @Column(name = "last_run_at")
    private Instant lastRunAt;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;

    public String getCursorKey() {
        return cursorKey;
    }

    public void setCursorKey(String cursorKey) {
        this.cursorKey = cursorKey;
    }

    public String getEndpoint() {
        return endpoint;
    }

    public void setEndpoint(String endpoint) {
        this.endpoint = endpoint;
    }

    public Instant getLastUpdatedSince() {
        return lastUpdatedSince;
    }

    public void setLastUpdatedSince(Instant lastUpdatedSince) {
        this.lastUpdatedSince = lastUpdatedSince;
    }

    public Instant getLastRunAt() {
        return lastRunAt;
    }

    public void setLastRunAt(Instant lastRunAt) {
        this.lastRunAt = lastRunAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
