package com.aoe4.ingest.client;

import com.aoe4.common.config.Aoe4Properties;
import com.aoe4.common.dto.Aoe4WorldDtos.GameApiResponse;
import com.aoe4.common.dto.Aoe4WorldDtos.GamesListApiResponse;
import com.aoe4.common.dto.Aoe4WorldDtos.PlayerApiResponse;
import com.aoe4.ingest.config.SummaryApiKeyStore;
import com.aoe4.persistence.entity.ApiRequestLog;
import com.aoe4.persistence.repository.ApiRequestLogRepository;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.util.retry.Retry;

import java.time.Duration;
import java.time.Instant;

@Component
public class Aoe4WorldClient {

    private final WebClient webClient;
    private final Aoe4Properties properties;
    private final SummaryApiKeyStore summaryApiKeyStore;
    private final ApiRequestLogRepository apiRequestLogRepository;

    public Aoe4WorldClient(WebClient.Builder webClientBuilder,
                           Aoe4Properties properties,
                           SummaryApiKeyStore summaryApiKeyStore,
                           ApiRequestLogRepository apiRequestLogRepository) {
        this.properties = properties;
        this.summaryApiKeyStore = summaryApiKeyStore;
        this.apiRequestLogRepository = apiRequestLogRepository;
        this.webClient = webClientBuilder
                .baseUrl(properties.getApi().getBaseUrl())
                .defaultHeader("User-Agent", properties.getApi().getUserAgent())
                .defaultHeader("Accept", "application/json")
                .build();
    }

    public PlayerApiResponse getPlayer(long profileId) {
        String path = "/players/" + profileId;
        return executeGet(path, PlayerApiResponse.class);
    }

    public GamesListApiResponse getPlayerGames(long profileId, int page, int limit, String leaderboard) {
        StringBuilder path = new StringBuilder("/players/")
                .append(profileId)
                .append("/games?page=")
                .append(page)
                .append("&limit=")
                .append(limit);
        if (leaderboard != null && !leaderboard.isBlank()) {
            path.append("&leaderboard=").append(leaderboard);
        }
        String apiKey = summaryApiKeyStore.resolve();
        if (apiKey != null && !apiKey.isBlank()) {
            path.append("&api_key=").append(apiKey);
        }
        return executeGet(path.toString(), GamesListApiResponse.class);
    }

    public GamesListApiResponse getUpdatedGames(String profileIdsCsv, Instant updatedSince, int page) {
        String path = "/games?profile_ids=" + profileIdsCsv
                + "&order=updated_at"
                + "&updated_since=" + updatedSince.toString()
                + "&page=" + page
                + "&per_page=" + properties.getSync().getGamesPageSize();
        return executeGet(path, GamesListApiResponse.class);
    }

    public GameApiResponse getGame(long gameId) {
        return executeGet("/games/" + gameId, GameApiResponse.class);
    }

    public com.aoe4.common.dto.Aoe4WorldDtos.PlayerSearchApiResponse searchPlayers(String query, int limit) {
        String path = "/players/search?query=" + java.net.URLEncoder.encode(query, java.nio.charset.StandardCharsets.UTF_8)
                + "&limit=" + limit;
        return executeGet(path, com.aoe4.common.dto.Aoe4WorldDtos.PlayerSearchApiResponse.class);
    }

    private <T> T executeGet(String path, Class<T> responseType) {
        long started = System.currentTimeMillis();
        String url = properties.getApi().getBaseUrl() + path;
        ApiRequestLog log = new ApiRequestLog();
        log.setUrl(redactApiKey(url));
        log.setCached(false);
        log.setCreatedAt(Instant.now());

        try {
            T body = webClient.get()
                    .uri(path)
                    .retrieve()
                    .onStatus(HttpStatusCode::isError, response -> response.createException())
                    .bodyToMono(responseType)
                    .retryWhen(Retry.backoff(properties.getApi().getMaxRetries(), Duration.ofSeconds(1))
                            .filter(this::isRetryable)
                            .onRetryExhaustedThrow((spec, signal) -> signal.failure()))
                    .timeout(properties.getApi().getTimeout())
                    .block();

            log.setHttpStatus(200);
            log.setLatencyMs(System.currentTimeMillis() - started);
            apiRequestLogRepository.save(log);
            return body;
        } catch (WebClientResponseException ex) {
            log.setHttpStatus(ex.getStatusCode().value());
            log.setLatencyMs(System.currentTimeMillis() - started);
            log.setErrorMessage(ex.getMessage());
            apiRequestLogRepository.save(log);
            throw ex;
        } catch (RuntimeException ex) {
            log.setLatencyMs(System.currentTimeMillis() - started);
            log.setErrorMessage(ex.getMessage());
            apiRequestLogRepository.save(log);
            throw ex;
        }
    }

    private static String redactApiKey(String url) {
        return url.replaceAll("api_key=[^&]+", "api_key=***");
    }

    private boolean isRetryable(Throwable throwable) {
        if (throwable instanceof WebClientResponseException ex) {
            int status = ex.getStatusCode().value();
            return status == 429 || status >= 500;
        }
        return true;
    }
}
