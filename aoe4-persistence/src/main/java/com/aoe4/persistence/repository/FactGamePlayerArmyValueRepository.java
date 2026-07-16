package com.aoe4.persistence.repository;

import com.aoe4.persistence.entity.FactGamePlayerArmyValue;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface FactGamePlayerArmyValueRepository extends JpaRepository<FactGamePlayerArmyValue, Long> {

    void deleteByGameIdAndProfileId(Long gameId, Long profileId);

    List<FactGamePlayerArmyValue> findByGameIdAndProfileId(Long gameId, Long profileId);
}
