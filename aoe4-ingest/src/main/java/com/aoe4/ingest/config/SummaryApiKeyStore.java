package com.aoe4.ingest.config;

import com.aoe4.common.config.Aoe4Properties;
import org.springframework.stereotype.Component;

@Component
public class SummaryApiKeyStore {

    private final Aoe4Properties properties;
    private volatile String runtimeApiKey;

    public SummaryApiKeyStore(Aoe4Properties properties) {
        this.properties = properties;
    }

    public String resolve() {
        if (runtimeApiKey != null && !runtimeApiKey.isBlank()) {
            return runtimeApiKey.trim();
        }
        String configured = properties.getSummary().getApiKey();
        return configured != null && !configured.isBlank() ? configured.trim() : null;
    }

    public void setRuntimeApiKey(String apiKey) {
        if (apiKey == null || apiKey.isBlank()) {
            runtimeApiKey = null;
            return;
        }
        runtimeApiKey = apiKey.trim();
    }

    public void clearRuntimeApiKey() {
        runtimeApiKey = null;
    }

    public boolean isConfigured() {
        String key = resolve();
        return key != null && !key.isBlank();
    }

    public String maskedSuffix() {
        String key = resolve();
        if (key == null || key.length() < 4) {
            return null;
        }
        return key.substring(key.length() - 4);
    }

    public boolean isRuntimeOverride() {
        return runtimeApiKey != null && !runtimeApiKey.isBlank();
    }
}
