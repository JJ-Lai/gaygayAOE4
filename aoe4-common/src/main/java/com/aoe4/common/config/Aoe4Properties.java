package com.aoe4.common.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

@ConfigurationProperties(prefix = "aoe4")
public class Aoe4Properties {

    private final Api api = new Api();
    private final Sync sync = new Sync();
    private final Summary summary = new Summary();
    private final Aggregation aggregation = new Aggregation();
    private final Frontend frontend = new Frontend();
    private final Ops ops = new Ops();

    public Api getApi() {
        return api;
    }

    public Sync getSync() {
        return sync;
    }

    public Summary getSummary() {
        return summary;
    }

    public Aggregation getAggregation() {
        return aggregation;
    }

    public Frontend getFrontend() {
        return frontend;
    }

    public Ops getOps() {
        return ops;
    }

    public static class Api {
        private String baseUrl = "https://aoe4world.com/api/v0";
        private String userAgent = "AOE4-Analytics/0.1 (dev)";
        private Duration timeout = Duration.ofSeconds(30);
        private int maxRetries = 3;

        public String getBaseUrl() {
            return baseUrl;
        }

        public void setBaseUrl(String baseUrl) {
            this.baseUrl = baseUrl;
        }

        public String getUserAgent() {
            return userAgent;
        }

        public void setUserAgent(String userAgent) {
            this.userAgent = userAgent;
        }

        public Duration getTimeout() {
            return timeout;
        }

        public void setTimeout(Duration timeout) {
            this.timeout = timeout;
        }

        public int getMaxRetries() {
            return maxRetries;
        }

        public void setMaxRetries(int maxRetries) {
            this.maxRetries = maxRetries;
        }
    }

    public static class Sync {
        private boolean enabled = true;
        private String cron = "0 */30 * * * *";
        private List<Long> defaultProfileIds = new ArrayList<>(List.of(10861747L));
        private int gamesPageSize = 50;

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(boolean enabled) {
            this.enabled = enabled;
        }

        public String getCron() {
            return cron;
        }

        public void setCron(String cron) {
            this.cron = cron;
        }

        public List<Long> getDefaultProfileIds() {
            return defaultProfileIds;
        }

        public void setDefaultProfileIds(List<Long> defaultProfileIds) {
            this.defaultProfileIds = defaultProfileIds;
        }

        public int getGamesPageSize() {
            return gamesPageSize;
        }

        public void setGamesPageSize(int gamesPageSize) {
            this.gamesPageSize = gamesPageSize;
        }
    }

    public static class Summary {
        private String baseUrl = "https://aoe4world.com";
        private String apiKey;
        private Duration requestInterval = Duration.ofSeconds(2);
        private Duration cacheTtl = Duration.ofDays(7);
        private Duration negativeCacheTtl = Duration.ofMinutes(3);
        private int batchSize = 5;
        private boolean syncEnabled = true;
        private String syncCron = "0 */5 * * * *";

        public String getBaseUrl() {
            return baseUrl;
        }

        public void setBaseUrl(String baseUrl) {
            this.baseUrl = baseUrl;
        }

        public String getApiKey() {
            return apiKey;
        }

        public void setApiKey(String apiKey) {
            this.apiKey = apiKey;
        }

        public Duration getRequestInterval() {
            return requestInterval;
        }

        public void setRequestInterval(Duration requestInterval) {
            this.requestInterval = requestInterval;
        }

        public Duration getCacheTtl() {
            return cacheTtl;
        }

        public void setCacheTtl(Duration cacheTtl) {
            this.cacheTtl = cacheTtl;
        }

        public Duration getNegativeCacheTtl() {
            return negativeCacheTtl;
        }

        public void setNegativeCacheTtl(Duration negativeCacheTtl) {
            this.negativeCacheTtl = negativeCacheTtl;
        }

        public int getBatchSize() {
            return batchSize;
        }

        public void setBatchSize(int batchSize) {
            this.batchSize = batchSize;
        }

        public boolean isSyncEnabled() {
            return syncEnabled;
        }

        public void setSyncEnabled(boolean syncEnabled) {
            this.syncEnabled = syncEnabled;
        }

        public String getSyncCron() {
            return syncCron;
        }

        public void setSyncCron(String syncCron) {
            this.syncCron = syncCron;
        }
    }

    public static class Aggregation {
        private boolean enabled = true;
        private String refreshCron = "0 0 */6 * * *";
        private Duration apiCacheTtl = Duration.ofMinutes(5);

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(boolean enabled) {
            this.enabled = enabled;
        }

        public String getRefreshCron() {
            return refreshCron;
        }

        public void setRefreshCron(String refreshCron) {
            this.refreshCron = refreshCron;
        }

        public Duration getApiCacheTtl() {
            return apiCacheTtl;
        }

        public void setApiCacheTtl(Duration apiCacheTtl) {
            this.apiCacheTtl = apiCacheTtl;
        }
    }

    public static class Frontend {
        private boolean spaEnabled = false;

        public boolean isSpaEnabled() {
            return spaEnabled;
        }

        public void setSpaEnabled(boolean spaEnabled) {
            this.spaEnabled = spaEnabled;
        }
    }

    public static class Ops {
        private boolean alertWebhookEnabled = false;
        private String alertWebhookUrl = "";
        private String alertCheckCron = "0 */15 * * * *";

        public boolean isAlertWebhookEnabled() {
            return alertWebhookEnabled;
        }

        public void setAlertWebhookEnabled(boolean alertWebhookEnabled) {
            this.alertWebhookEnabled = alertWebhookEnabled;
        }

        public String getAlertWebhookUrl() {
            return alertWebhookUrl;
        }

        public void setAlertWebhookUrl(String alertWebhookUrl) {
            this.alertWebhookUrl = alertWebhookUrl;
        }

        public String getAlertCheckCron() {
            return alertCheckCron;
        }

        public void setAlertCheckCron(String alertCheckCron) {
            this.alertCheckCron = alertCheckCron;
        }
    }
}
