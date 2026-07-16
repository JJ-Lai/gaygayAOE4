package com.aoe4.persistence.repository;

import com.aoe4.persistence.entity.DimPlayer;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DimPlayerRepository extends JpaRepository<DimPlayer, Long> {
}
