package com.aoe4.persistence.repository;

import com.aoe4.persistence.entity.DimLeaderboard;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DimLeaderboardRepository extends JpaRepository<DimLeaderboard, String> {
}
