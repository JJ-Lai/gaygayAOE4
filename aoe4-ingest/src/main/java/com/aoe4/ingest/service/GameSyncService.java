package com.aoe4.ingest.service;

import com.aoe4.common.config.Aoe4Properties;
import com.aoe4.common.metrics.Aoe4Metrics;
import com.aoe4.common.dto.Aoe4WorldDtos.GameApiResponse;
import com.aoe4.common.dto.Aoe4WorldDtos.GamesListApiResponse;
import com.aoe4.common.dto.ApiViews.SyncResultView;
import com.aoe4.ingest.client.Aoe4WorldClient;
import com.aoe4.persistence.entity.SyncCursor;
import com.aoe4.persistence.repository.SyncCursorRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class GameSyncService {

    private static final Logger log = LoggerFactory.getLogger(GameSyncService.class);
    private static final String CURSOR_KEY = "default-profiles";

    private final Aoe4WorldClient aoe4WorldClient;
    private final GamePersistenceService gamePersistenceService;
    private final SyncCursorRepository syncCursorRepository;
    private final Aoe4Properties properties;
    private final Aoe4Metrics metrics;

    public GameSyncService(Aoe4WorldClient aoe4WorldClient,
                           GamePersistenceService gamePersistenceService,
                           SyncCursorRepository syncCursorRepository,
                           Aoe4Properties properties,
                           Aoe4Metrics metrics) {
        this.aoe4WorldClient = aoe4WorldClient;
        this.gamePersistenceService = gamePersistenceService;
        this.syncCursorRepository = syncCursorRepository;
        this.properties = properties;
        this.metrics = metrics;
    }

    @Transactional
    public SyncResultView syncPlayer(long profileId) {
        log.info("Syncing player {}", profileId);
        gamePersistenceService.upsertPlayer(aoe4WorldClient.getPlayer(profileId));

        int processed = 0;
        int page = 1;
        int pageSize = properties.getSync().getGamesPageSize();
        while (true) {
            GamesListApiResponse response = aoe4WorldClient.getPlayerGames(profileId, page, pageSize, null);
            if (response.games() == null || response.games().isEmpty()) {
                break;
            }
            for (GameApiResponse game : response.games()) {
                gamePersistenceService.upsertGame(game);
                processed++;
            }
            if (response.games().size() < pageSize) {
                break;
            }
            page++;
        }

        updateCursor(Instant.now());
        metrics.recordPlayerSync(processed);
        return new SyncResultView(profileId, processed, Instant.now());
    }

    @Transactional
    public int syncDefaultProfilesIncremental() {
        List<Long> profileIds = properties.getSync().getDefaultProfileIds();
        if (profileIds == null || profileIds.isEmpty()) {
            return 0;
        }

        Instant updatedSince = syncCursorRepository.findById(CURSOR_KEY)
                .map(SyncCursor::getLastUpdatedSince)
                .orElse(Instant.EPOCH.minusSeconds(3600));

        String profileIdsCsv = profileIds.stream()
                .map(String::valueOf)
                .collect(Collectors.joining(","));

        int processed = 0;
        for (int page = 1; page <= 20; page++) {
            GamesListApiResponse response = aoe4WorldClient.getUpdatedGames(profileIdsCsv, updatedSince, page);
            if (response.games() == null || response.games().isEmpty()) {
                break;
            }
            for (GameApiResponse game : response.games()) {
                gamePersistenceService.upsertGame(game);
                processed++;
            }
            if (response.games().size() < properties.getSync().getGamesPageSize()) {
                break;
            }
        }

        updateCursor(Instant.now());
        log.info("Incremental sync processed {} games for profiles {}", processed, profileIdsCsv);
        return processed;
    }

    private void updateCursor(Instant runAt) {
        SyncCursor cursor = syncCursorRepository.findById(CURSOR_KEY).orElseGet(SyncCursor::new);
        cursor.setCursorKey(CURSOR_KEY);
        cursor.setEndpoint("/games");
        cursor.setLastUpdatedSince(runAt.minusSeconds(60));
        cursor.setLastRunAt(runAt);
        if (cursor.getCreatedAt() == null) {
            cursor.setCreatedAt(runAt);
        }
        cursor.setUpdatedAt(runAt);
        syncCursorRepository.save(cursor);
    }
}
