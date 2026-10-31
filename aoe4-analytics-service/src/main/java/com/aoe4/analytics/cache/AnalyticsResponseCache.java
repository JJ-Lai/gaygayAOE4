package com.aoe4.analytics.cache;

import com.aoe4.common.config.Aoe4Properties;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.stereotype.Component;

import java.util.function.Supplier;

@Component
public class AnalyticsResponseCache {

    private final Cache<String, Object> cache;

    public AnalyticsResponseCache(Aoe4Properties properties) {
        this.cache = Caffeine.newBuilder()
                .maximumSize(500)
                .expireAfterWrite(properties.getAggregation().getApiCacheTtl())
                .build();
    }

    @SuppressWarnings("unchecked")
    public <T> T getOrLoad(String key, Supplier<T> loader) {
        return (T) cache.get(key, ignored -> loader.get());
    }

    public void invalidateProfile(long profileId) {
        String prefix = profileId + ":";
        cache.asMap().keySet().removeIf(key -> key.startsWith(prefix));
    }
}
