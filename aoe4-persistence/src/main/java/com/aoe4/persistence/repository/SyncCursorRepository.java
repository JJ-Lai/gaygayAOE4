package com.aoe4.persistence.repository;

import com.aoe4.persistence.entity.SyncCursor;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SyncCursorRepository extends JpaRepository<SyncCursor, String> {
}
