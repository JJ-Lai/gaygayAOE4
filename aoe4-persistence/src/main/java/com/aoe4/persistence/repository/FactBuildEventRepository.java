package com.aoe4.persistence.repository;

import com.aoe4.persistence.entity.FactBuildEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface FactBuildEventRepository extends JpaRepository<FactBuildEvent, Long> {

    void deleteByGameIdAndProfileId(Long gameId, Long profileId);

    long countByGameIdAndProfileId(Long gameId, Long profileId);

    List<FactBuildEvent> findByGameIdAndProfileId(Long gameId, Long profileId);
}
