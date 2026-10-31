package com.aoe4.persistence.repository;

import com.aoe4.persistence.entity.FactGame;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FactGameRepository extends JpaRepository<FactGame, Long> {

    @Query("""
            SELECT g FROM FactGame g
            WHERE EXISTS (
                SELECT 1 FROM FactGamePlayer gp
                WHERE gp.gameId = g.gameId AND gp.profileId = :profileId
            )
            ORDER BY g.startedAt DESC
            """)
    Page<FactGame> findByProfileId(@Param("profileId") Long profileId, Pageable pageable);

    @Query("""
            SELECT COUNT(g) FROM FactGame g
            WHERE EXISTS (
                SELECT 1 FROM FactGamePlayer gp
                WHERE gp.gameId = g.gameId AND gp.profileId = :profileId
            )
            """)
    long countByProfileId(@Param("profileId") Long profileId);
}
