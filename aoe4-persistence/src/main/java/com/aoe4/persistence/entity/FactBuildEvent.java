package com.aoe4.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "fact_build_event")
public class FactBuildEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "game_id")
    private Long gameId;

    @Column(name = "profile_id")
    private Long profileId;

    @Column(name = "event_second")
    private Integer eventSecond;

    @Column(name = "entity_type")
    private String entityType;

    private Long pbgid;

    @Column(name = "event_kind")
    private String eventKind;

    @Column(name = "created_at")
    private Instant createdAt;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getGameId() {
        return gameId;
    }

    public void setGameId(Long gameId) {
        this.gameId = gameId;
    }

    public Long getProfileId() {
        return profileId;
    }

    public void setProfileId(Long profileId) {
        this.profileId = profileId;
    }

    public Integer getEventSecond() {
        return eventSecond;
    }

    public void setEventSecond(Integer eventSecond) {
        this.eventSecond = eventSecond;
    }

    public String getEntityType() {
        return entityType;
    }

    public void setEntityType(String entityType) {
        this.entityType = entityType;
    }

    public Long getPbgid() {
        return pbgid;
    }

    public void setPbgid(Long pbgid) {
        this.pbgid = pbgid;
    }

    public String getEventKind() {
        return eventKind;
    }

    public void setEventKind(String eventKind) {
        this.eventKind = eventKind;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
