package com.aoe4.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "dim_patch")
public class DimPatch {

    @Id
    @Column(name = "patch_number")
    private Integer patchNumber;

    @Column(name = "created_at")
    private Instant createdAt;

    public Integer getPatchNumber() {
        return patchNumber;
    }

    public void setPatchNumber(Integer patchNumber) {
        this.patchNumber = patchNumber;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
