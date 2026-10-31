package com.aoe4.persistence.repository;

import com.aoe4.persistence.entity.RawGameSummary;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface RawGameSummaryRepository extends JpaRepository<RawGameSummary, Long> {

    long countByProfileIdAndFetchStatus(Long profileId, String fetchStatus);

    long countByProfileId(Long profileId);

    @Query("""
            SELECT g.gameId FROM FactGame g
            WHERE EXISTS (
                SELECT 1 FROM FactGamePlayer gp
                WHERE gp.gameId = g.gameId AND gp.profileId = :profileId
            )
            AND NOT EXISTS (
                SELECT 1 FROM RawGameSummary r
                WHERE r.gameId = g.gameId AND r.fetchStatus = 'SUCCESS'
            )
            AND NOT EXISTS (
                SELECT 1 FROM RawGameSummary r
                WHERE r.gameId = g.gameId AND r.fetchStatus = 'NOT_FOUND'
            )
            AND (
                NOT EXISTS (SELECT 1 FROM RawGameSummary r WHERE r.gameId = g.gameId)
                OR EXISTS (
                    SELECT 1 FROM RawGameSummary r
                    WHERE r.gameId = g.gameId
                      AND r.fetchStatus IN ('FAILED', 'RATE_LIMITED', 'PARSE_FAILED')
                      AND r.retryCount < :maxRetries
                )
            )
            ORDER BY g.startedAt DESC
            """)
    List<Long> findPendingSummaryGameIds(@Param("profileId") Long profileId,
                                         @Param("maxRetries") int maxRetries);

    @Query("""
            SELECT r.fetchStatus AS status, COUNT(r) AS count
            FROM RawGameSummary r
            GROUP BY r.fetchStatus
            """)
    List<StatusCountRow> countGroupedByFetchStatus();

    @Query("""
            SELECT COUNT(g) FROM FactGame g
            WHERE NOT EXISTS (SELECT 1 FROM RawGameSummary r WHERE r.gameId = g.gameId)
            """)
    long countGamesWithoutSummary();

    List<RawGameSummary> findByFetchStatusInOrderByFetchedAtDesc(List<String> fetchStatuses,
                                                                 org.springframework.data.domain.Pageable pageable);

    List<RawGameSummary> findByFetchStatusOrderByFetchedAtDesc(String fetchStatus,
                                                               org.springframework.data.domain.Pageable pageable);

    List<RawGameSummary> findByFetchStatusAndProfileIdOrderByFetchedAtDesc(String fetchStatus,
                                                                           Long profileId,
                                                                           org.springframework.data.domain.Pageable pageable);

    @Query("""
            SELECT COUNT(r) FROM RawGameSummary r
            WHERE r.fetchStatus IN ('FAILED', 'RATE_LIMITED', 'PARSE_FAILED')
              AND r.retryCount >= :maxRetries
            """)
    long countExhaustedRetries(@Param("maxRetries") int maxRetries);

    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true)
    @Query("""
            UPDATE RawGameSummary r SET r.retryCount = 0
            WHERE r.fetchStatus IN ('FAILED', 'RATE_LIMITED', 'PARSE_FAILED')
              AND r.retryCount >= :maxRetries
              AND (:profileId IS NULL OR r.profileId = :profileId)
            """)
    int resetExhaustedRetries(@Param("profileId") Long profileId, @Param("maxRetries") int maxRetries);

    interface StatusCountRow {
        String getStatus();

        long getCount();
    }
}
