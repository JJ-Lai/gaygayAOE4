package com.aoe4.persistence.repository;

import com.aoe4.persistence.entity.DimMap;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface DimMapRepository extends JpaRepository<DimMap, Long> {
    Optional<DimMap> findByMapName(String mapName);
}
