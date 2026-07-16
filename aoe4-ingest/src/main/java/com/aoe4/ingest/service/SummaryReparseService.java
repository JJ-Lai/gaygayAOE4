package com.aoe4.ingest.service;

import com.aoe4.common.dto.ApiViews.ReparseSummariesResultView;
import com.aoe4.persistence.entity.RawGameSummary;
import com.aoe4.persistence.repository.RawGameSummaryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;

@Service
public class SummaryReparseService {

    private static final Logger log = LoggerFactory.getLogger(SummaryReparseService.class);
    private static final int MAX_GAMES = 50;

    private final RawGameSummaryRepository rawGameSummaryRepository;
    private final SummaryParser summaryParser;

    public SummaryReparseService(RawGameSummaryRepository rawGameSummaryRepository,
                               SummaryParser summaryParser) {
        this.rawGameSummaryRepository = rawGameSummaryRepository;
        this.summaryParser = summaryParser;
    }

    public ReparseSummariesResultView reparseSuccessSummaries(Long profileId, int maxGames) {
        int capped = Math.min(Math.max(maxGames, 1), MAX_GAMES);
        List<RawGameSummary> summaries = loadSummaries(profileId, capped);
        int succeeded = 0;
        int failed = 0;
        for (RawGameSummary summary : summaries) {
            if (summary.getPayload() == null || summary.getPayload().isBlank()) {
                failed++;
                continue;
            }
            try {
                summaryParser.persist(summary.getGameId(), summary.getPayload());
                succeeded++;
            } catch (Exception ex) {
                failed++;
                log.warn("Reparse failed for game {}: {}", summary.getGameId(), ex.getMessage());
            }
        }
        return new ReparseSummariesResultView(
                profileId,
                summaries.size(),
                succeeded,
                failed,
                Instant.now()
        );
    }

    private List<RawGameSummary> loadSummaries(Long profileId, int capped) {
        PageRequest page = PageRequest.of(0, capped);
        if (profileId != null) {
            return rawGameSummaryRepository
                    .findByFetchStatusAndProfileIdOrderByFetchedAtDesc("SUCCESS", profileId, page);
        }
        return rawGameSummaryRepository.findByFetchStatusOrderByFetchedAtDesc("SUCCESS", page);
    }
}
