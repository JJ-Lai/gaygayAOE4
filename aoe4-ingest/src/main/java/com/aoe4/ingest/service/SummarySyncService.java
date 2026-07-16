package com.aoe4.ingest.service;

import com.aoe4.common.config.Aoe4Properties;
import com.aoe4.common.metrics.Aoe4Metrics;
import com.aoe4.common.dto.ApiViews.SummarySyncResultView;
import com.aoe4.ingest.client.SummaryClient;
import com.aoe4.ingest.client.SummaryFetchResult;
import com.aoe4.persistence.entity.RawGameSummary;
import com.aoe4.persistence.repository.RawGameSummaryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Locale;

@Service
public class SummarySyncService {

    private static final Logger log = LoggerFactory.getLogger(SummarySyncService.class);
    private static final int MAX_SUMMARY_RETRIES = 3;

    private final SummaryClient summaryClient;
    private final SummaryParser summaryParser;
    private final RawGameSummaryRepository rawGameSummaryRepository;
    private final Aoe4Properties properties;
    private final Aoe4Metrics metrics;

    public SummarySyncService(SummaryClient summaryClient,
                              SummaryParser summaryParser,
                              RawGameSummaryRepository rawGameSummaryRepository,
                              Aoe4Properties properties,
                              Aoe4Metrics metrics) {
        this.summaryClient = summaryClient;
        this.summaryParser = summaryParser;
        this.rawGameSummaryRepository = rawGameSummaryRepository;
        this.properties = properties;
        this.metrics = metrics;
    }

    @Transactional
    public SummarySyncResultView syncPendingForProfile(long profileId) {
        return syncPendingForProfile(profileId, properties.getSummary().getBatchSize());
    }

    @Transactional
    public SummarySyncResultView syncPendingForProfile(long profileId, int maxGames) {
        List<Long> pending = rawGameSummaryRepository.findPendingSummaryGameIds(profileId, MAX_SUMMARY_RETRIES);
        int attempted = 0;
        int succeeded = 0;
        int failed = 0;

        for (Long gameId : pending) {
            if (attempted >= maxGames) {
                break;
            }
            attempted++;
            if (syncSingleGame(profileId, gameId)) {
                succeeded++;
            } else {
                failed++;
            }
        }

        metrics.recordSummarySync(failed == 0 ? "success" : "partial");

        log.info("Summary sync for profile {}: attempted={}, succeeded={}, failed={}",
                profileId, attempted, succeeded, failed);
        return new SummarySyncResultView(profileId, attempted, succeeded, failed, Instant.now());
    }

    @Transactional
    public SummarySyncResultView retryFailedSummaries(Long profileId, int maxGames) {
        int reset = rawGameSummaryRepository.resetExhaustedRetries(profileId, MAX_SUMMARY_RETRIES);
        log.info("Reset {} exhausted summary retries for profile {}", reset, profileId);

        // Include NOT_FOUND so private matches can be re-fetched after a Summary api_key is set.
        List<String> statuses = List.of("FAILED", "RATE_LIMITED", "PARSE_FAILED", "NOT_FOUND");
        java.util.LinkedHashSet<Long> uniqueGameIds = new java.util.LinkedHashSet<>();
        if (profileId != null) {
            uniqueGameIds.addAll(rawGameSummaryRepository.findPendingSummaryGameIds(profileId, MAX_SUMMARY_RETRIES));
            for (String status : statuses) {
                rawGameSummaryRepository
                        .findByFetchStatusAndProfileIdOrderByFetchedAtDesc(
                                status, profileId, org.springframework.data.domain.PageRequest.of(0, maxGames))
                        .forEach(raw -> uniqueGameIds.add(raw.getGameId()));
            }
        } else {
            rawGameSummaryRepository.findByFetchStatusInOrderByFetchedAtDesc(
                    statuses,
                    org.springframework.data.domain.PageRequest.of(0, maxGames)
            ).forEach(raw -> uniqueGameIds.add(raw.getGameId()));
        }

        List<Long> gameIds = uniqueGameIds.stream().limit(maxGames).toList();

        int attempted = 0;
        int succeeded = 0;
        int failed = 0;
        for (Long gameId : gameIds) {
            Long owner = profileId != null
                    ? profileId
                    : rawGameSummaryRepository.findById(gameId)
                            .map(RawGameSummary::getProfileId)
                            .orElse(null);
            if (owner == null) {
                continue;
            }
            attempted++;
            if (syncSingleGame(owner, gameId)) {
                succeeded++;
            } else {
                failed++;
            }
        }
        return new SummarySyncResultView(
                profileId != null ? profileId : 0L,
                attempted,
                succeeded,
                failed,
                Instant.now()
        );
    }

    public boolean syncSingleGame(long profileId, long gameId) {
        SummaryFetchResult fetchResult = summaryClient.getGameSummary(profileId, gameId);
        Instant now = Instant.now();
        RawGameSummary raw = rawGameSummaryRepository.findById(gameId).orElseGet(RawGameSummary::new);
        raw.setGameId(gameId);
        raw.setProfileId(profileId);
        raw.setFetchedAt(now);
        if (raw.getCreatedAt() == null) {
            raw.setCreatedAt(now);
        }

        if (!fetchResult.isSuccess()) {
            raw.setFetchStatus(mapStatus(fetchResult));
            raw.setErrorMessage(truncate(fetchResult.getErrorMessage(), 500));
            raw.setPayload(raw.getPayload() != null ? raw.getPayload() : "{}");
            raw.setRetryCount(raw.getRetryCount() + 1);
            rawGameSummaryRepository.save(raw);
            metrics.recordSummarySync(mapStatus(fetchResult).toLowerCase(Locale.ROOT));
            return false;
        }

        try {
            var summary = summaryParser.parse(fetchResult.getPayload());
            summaryParser.persist(gameId, fetchResult.getPayload());

            raw.setPayload(fetchResult.getPayload());
            raw.setSummaryVersion(summary.summaryVersion());
            raw.setFetchStatus("SUCCESS");
            raw.setErrorMessage(null);
            raw.setRetryCount(0);
            rawGameSummaryRepository.save(raw);
            metrics.recordSummarySync("success");
            return true;
        } catch (Exception ex) {
            log.warn("Failed to parse summary for game {} profile {}: {}", gameId, profileId, ex.getMessage());
            raw.setPayload(fetchResult.getPayload());
            raw.setFetchStatus("PARSE_FAILED");
            raw.setErrorMessage(truncate(ex.getMessage(), 500));
            raw.setRetryCount(raw.getRetryCount() + 1);
            rawGameSummaryRepository.save(raw);
            metrics.recordSummarySync("parse_failed");
            return false;
        }
    }

    @Transactional
    public boolean importFromPayload(long profileId, long gameId, String payload) {
        Instant now = Instant.now();
        try {
            var summary = summaryParser.parse(payload);
            summaryParser.persist(gameId, payload);

            RawGameSummary raw = rawGameSummaryRepository.findById(gameId).orElseGet(RawGameSummary::new);
            raw.setGameId(gameId);
            raw.setProfileId(profileId);
            raw.setPayload(payload);
            raw.setSummaryVersion(summary.summaryVersion());
            raw.setFetchStatus("SUCCESS");
            raw.setErrorMessage(null);
            raw.setFetchedAt(now);
            if (raw.getCreatedAt() == null) {
                raw.setCreatedAt(now);
            }
            rawGameSummaryRepository.save(raw);
            return true;
        } catch (Exception ex) {
            log.warn("Failed to import summary payload for game {}: {}", gameId, ex.getMessage());
            return false;
        }
    }

    private static String mapStatus(SummaryFetchResult result) {
        return switch (result.getStatus()) {
            case NOT_FOUND -> "NOT_FOUND";
            case RATE_LIMITED -> "RATE_LIMITED";
            default -> "FAILED";
        };
    }

    private static String truncate(String value, int maxLen) {
        if (value == null) {
            return null;
        }
        return value.length() <= maxLen ? value : value.substring(0, maxLen);
    }
}
