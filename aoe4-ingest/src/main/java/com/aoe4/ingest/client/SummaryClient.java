package com.aoe4.ingest.client;

import com.aoe4.common.config.Aoe4Properties;
import com.aoe4.ingest.config.SummaryApiKeyStore;
import com.aoe4.persistence.entity.ApiRequestLog;
import com.aoe4.persistence.repository.ApiRequestLogRepository;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Component
public class SummaryClient {

    private static final Logger log = LoggerFactory.getLogger(SummaryClient.class);
    private static final String NEGATIVE_MARKER = "__NEGATIVE__";

    private final WebClient webClient;
    private final Aoe4Properties properties;
    private final SummaryApiKeyStore summaryApiKeyStore;
    private final ApiRequestLogRepository apiRequestLogRepository;
    private final Cache<String, String> positiveCache;
    private final Cache<String, String> negativeCache;
    private final ConcurrentMap<String, CompletableFuture<SummaryFetchResult>> inFlight = new ConcurrentHashMap<>();
    private final Object rateLimitLock = new Object();
    private long lastRequestNanos;

    public SummaryClient(WebClient.Builder webClientBuilder,
                         Aoe4Properties properties,
                         SummaryApiKeyStore summaryApiKeyStore,
                         ApiRequestLogRepository apiRequestLogRepository) {
        this.properties = properties;
        this.summaryApiKeyStore = summaryApiKeyStore;
        this.apiRequestLogRepository = apiRequestLogRepository;
        this.webClient = webClientBuilder
                .baseUrl(properties.getSummary().getBaseUrl())
                .defaultHeader("User-Agent", properties.getApi().getUserAgent())
                .defaultHeader("Accept", "application/json")
                .build();
        this.positiveCache = Caffeine.newBuilder()
                .expireAfterWrite(properties.getSummary().getCacheTtl())
                .maximumSize(10_000)
                .build();
        this.negativeCache = Caffeine.newBuilder()
                .expireAfterWrite(properties.getSummary().getNegativeCacheTtl())
                .maximumSize(5_000)
                .build();
    }

    public SummaryFetchResult getGameSummary(long profileId, long gameId) {
        String cacheKey = cacheKey(profileId, gameId);
        String cached = positiveCache.getIfPresent(cacheKey);
        if (cached != null) {
            return SummaryFetchResult.success(cached, true);
        }
        if (NEGATIVE_MARKER.equals(negativeCache.getIfPresent(cacheKey))) {
            return SummaryFetchResult.rateLimited("Negative cache hit for " + cacheKey);
        }

        CompletableFuture<SummaryFetchResult> created = new CompletableFuture<>();
        CompletableFuture<SummaryFetchResult> existing = inFlight.putIfAbsent(cacheKey, created);
        if (existing != null) {
            return existing.join();
        }

        try {
            SummaryFetchResult result = fetchRemote(profileId, gameId, cacheKey);
            created.complete(result);
            return result;
        } catch (RuntimeException ex) {
            created.completeExceptionally(ex);
            throw ex;
        } finally {
            inFlight.remove(cacheKey);
        }
    }

    private SummaryFetchResult fetchRemote(long profileId, long gameId, String cacheKey) {
        waitForRateLimit();

        String path = UriComponentsBuilder.fromPath("/players/{profileId}/games/{gameId}/summary")
                .queryParam("camelize", true)
                .buildAndExpand(profileId, gameId)
                .toUriString();

        String apiKey = summaryApiKeyStore.resolve();
        if (apiKey != null) {
            path = UriComponentsBuilder.fromUriString(path)
                    .queryParam("api_key", apiKey)
                    .build()
                    .toUriString();
        }

        long started = System.currentTimeMillis();
        String url = properties.getSummary().getBaseUrl() + path;
        ApiRequestLog requestLog = new ApiRequestLog();
        requestLog.setUrl(redactApiKey(url));
        requestLog.setCached(false);
        requestLog.setCreatedAt(Instant.now());

        try {
            String body = webClient.get()
                    .uri(path)
                    .retrieve()
                    .onStatus(HttpStatusCode::isError, response -> response.createException())
                    .bodyToMono(String.class)
                    .timeout(properties.getApi().getTimeout())
                    .block();

            requestLog.setHttpStatus(200);
            requestLog.setLatencyMs(System.currentTimeMillis() - started);
            apiRequestLogRepository.save(requestLog);

            positiveCache.put(cacheKey, body);
            return SummaryFetchResult.success(body, false);
        } catch (WebClientResponseException ex) {
            requestLog.setHttpStatus(ex.getStatusCode().value());
            requestLog.setLatencyMs(System.currentTimeMillis() - started);
            requestLog.setErrorMessage(ex.getMessage());
            apiRequestLogRepository.save(requestLog);

            if (ex.getStatusCode().value() == 404) {
                return SummaryFetchResult.notFound(ex.getMessage());
            }
            if (ex.getStatusCode().value() == 429) {
                negativeCache.put(cacheKey, NEGATIVE_MARKER);
                log.warn("Summary API rate limited for profileId={} gameId={}", profileId, gameId);
                return SummaryFetchResult.rateLimited(ex.getMessage());
            }
            return SummaryFetchResult.error(ex.getMessage(), ex.getStatusCode().value());
        } catch (RuntimeException ex) {
            requestLog.setLatencyMs(System.currentTimeMillis() - started);
            requestLog.setErrorMessage(ex.getMessage());
            apiRequestLogRepository.save(requestLog);
            return SummaryFetchResult.error(ex.getMessage(), 0);
        }
    }

    private void waitForRateLimit() {
        Duration interval = properties.getSummary().getRequestInterval();
        long intervalNanos = interval.toNanos();
        synchronized (rateLimitLock) {
            long now = System.nanoTime();
            long elapsed = now - lastRequestNanos;
            if (elapsed < intervalNanos) {
                long sleepNanos = intervalNanos - elapsed;
                try {
                    Thread.sleep(sleepNanos / 1_000_000L, (int) (sleepNanos % 1_000_000L));
                } catch (InterruptedException ex) {
                    Thread.currentThread().interrupt();
                }
            }
            lastRequestNanos = System.nanoTime();
        }
    }

    private static String cacheKey(long profileId, long gameId) {
        return profileId + ":" + gameId;
    }

    private static String redactApiKey(String url) {
        return url.replaceAll("api_key=[^&]+", "api_key=***");
    }
}
