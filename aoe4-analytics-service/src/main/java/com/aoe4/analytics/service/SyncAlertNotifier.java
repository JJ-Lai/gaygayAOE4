package com.aoe4.analytics.service;

import com.aoe4.common.config.Aoe4Properties;
import com.aoe4.common.dto.ApiViews.AlertNotifyResultView;
import com.aoe4.common.dto.ApiViews.SyncAlertView;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Collectors;

@Service
public class SyncAlertNotifier {

    private static final Logger log = LoggerFactory.getLogger(SyncAlertNotifier.class);

    private final Aoe4Properties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final AtomicReference<String> lastFingerprint = new AtomicReference<>("");

    public SyncAlertNotifier(Aoe4Properties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newHttpClient();
    }

    public AlertNotifyResultView notifyIfNeeded(List<SyncAlertView> alerts, boolean force) {
        Instant checkedAt = Instant.now();
        if (!properties.getOps().isAlertWebhookEnabled()) {
            return new AlertNotifyResultView(false, "webhook_disabled", alerts.size(), checkedAt);
        }
        String webhookUrl = properties.getOps().getAlertWebhookUrl();
        if (webhookUrl == null || webhookUrl.isBlank()) {
            return new AlertNotifyResultView(false, "webhook_url_missing", alerts.size(), checkedAt);
        }
        if (alerts.isEmpty()) {
            lastFingerprint.set("");
            return new AlertNotifyResultView(false, "no_alerts", 0, checkedAt);
        }

        String fingerprint = fingerprint(alerts);
        if (!force && fingerprint.equals(lastFingerprint.get())) {
            return new AlertNotifyResultView(false, "unchanged", alerts.size(), checkedAt);
        }

        try {
            String body = objectMapper.writeValueAsString(Map.of(
                    "source", "aoe4-analytics",
                    "text", formatText(alerts),
                    "alerts", alerts,
                    "checkedAt", checkedAt.toString()
            ));
            HttpRequest request = HttpRequest.newBuilder(URI.create(webhookUrl.trim()))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                lastFingerprint.set(fingerprint);
                log.info("Sync alert webhook delivered ({} alerts)", alerts.size());
                return new AlertNotifyResultView(true, "sent", alerts.size(), checkedAt);
            }
            log.warn("Sync alert webhook failed: HTTP {}", response.statusCode());
            return new AlertNotifyResultView(false, "http_" + response.statusCode(), alerts.size(), checkedAt);
        } catch (Exception ex) {
            log.warn("Sync alert webhook failed: {}", ex.getMessage());
            return new AlertNotifyResultView(false, "error", alerts.size(), checkedAt);
        }
    }

    private static String fingerprint(List<SyncAlertView> alerts) {
        return alerts.stream()
                .sorted(Comparator.comparing(SyncAlertView::code))
                .map(alert -> alert.code() + ":" + alert.count())
                .collect(Collectors.joining(","));
    }

    private static String formatText(List<SyncAlertView> alerts) {
        String lines = alerts.stream()
                .map(alert -> "[" + alert.severity() + "] " + alert.message() + " (" + alert.count() + ")")
                .collect(Collectors.joining("\n"));
        return "AOE4 Sync Alerts\n" + lines;
    }
}
