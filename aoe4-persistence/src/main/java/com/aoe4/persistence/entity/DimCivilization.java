package com.aoe4.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "dim_civilization")
public class DimCivilization {

    @Id
    @Column(name = "civ_code")
    private String civCode;

    @Column(name = "civ_name")
    private String civName;

    @Column(name = "created_at")
    private Instant createdAt;

    public String getCivCode() {
        return civCode;
    }

    public void setCivCode(String civCode) {
        this.civCode = civCode;
    }

    public String getCivName() {
        return civName;
    }

    public void setCivName(String civName) {
        this.civName = civName;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
