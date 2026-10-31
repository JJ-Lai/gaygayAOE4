package com.aoe4.persistence.repository;

import com.aoe4.persistence.entity.FactGamePlayerResource;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface FactGamePlayerResourceRepository extends JpaRepository<FactGamePlayerResource, Long> {

    void deleteByGameIdAndProfileId(Long gameId, Long profileId);

    long countByGameIdAndProfileId(Long gameId, Long profileId);

    List<FactGamePlayerResource> findByGameIdAndProfileId(Long gameId, Long profileId);
}
