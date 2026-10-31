package com.aoe4.persistence.repository;

import com.aoe4.persistence.entity.FactGamePlayerScore;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FactGamePlayerScoreRepository extends JpaRepository<FactGamePlayerScore, FactGamePlayerScore.ScoreId> {
}
