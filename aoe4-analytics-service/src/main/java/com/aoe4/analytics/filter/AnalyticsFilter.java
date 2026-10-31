package com.aoe4.analytics.filter;

import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

public class AnalyticsFilter {

    private final long profileId;
    private final String civCode;
    private final String opponentCiv;
    private final String leaderboard;
    private final Integer patchNumber;
    private final Instant dateFrom;
    private final Instant dateTo;
    private final List<String> resources;
    private final Integer minuteFrom;
    private final Integer minuteTo;
    private final Integer ratingMin;
    private final Integer ratingMax;

    private AnalyticsFilter(Builder builder) {
        this.profileId = builder.profileId;
        this.civCode = normalize(builder.civCode);
        this.opponentCiv = normalize(builder.opponentCiv);
        this.leaderboard = normalize(builder.leaderboard);
        this.patchNumber = builder.patchNumber;
        this.dateFrom = builder.dateFrom;
        this.dateTo = builder.dateTo;
        this.resources = builder.resources != null ? List.copyOf(builder.resources) : List.of();
        this.minuteFrom = builder.minuteFrom;
        this.minuteTo = builder.minuteTo;
        this.ratingMin = builder.ratingMin;
        this.ratingMax = builder.ratingMax;
    }

    public static Builder builder(long profileId) {
        return new Builder(profileId);
    }

    public long getProfileId() {
        return profileId;
    }

    public String getCivCode() {
        return civCode;
    }

    public String getOpponentCiv() {
        return opponentCiv;
    }

    public String getLeaderboard() {
        return leaderboard;
    }

    public Integer getPatchNumber() {
        return patchNumber;
    }

    public Instant getDateFrom() {
        return dateFrom;
    }

    public Instant getDateTo() {
        return dateTo;
    }

    public List<String> getResources() {
        return resources;
    }

    public Integer getMinuteFrom() {
        return minuteFrom;
    }

    public Integer getMinuteTo() {
        return minuteTo;
    }

    public Integer getRatingMin() {
        return ratingMin;
    }

    public Integer getRatingMax() {
        return ratingMax;
    }

    public boolean hasDateFilter() {
        return dateFrom != null || dateTo != null;
    }

    public boolean hasRatingFilter() {
        return ratingMin != null || ratingMax != null;
    }

    public boolean canUseAggregates() {
        return !hasDateFilter() && !hasRatingFilter();
    }

    private static String normalize(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim().toLowerCase(Locale.ROOT);
    }

    public static class Builder {
        private final long profileId;
        private String civCode;
        private String opponentCiv;
        private String leaderboard;
        private Integer patchNumber;
        private Instant dateFrom;
        private Instant dateTo;
        private List<String> resources = Collections.emptyList();
        private Integer minuteFrom;
        private Integer minuteTo;
        private Integer ratingMin;
        private Integer ratingMax;

        public Builder(long profileId) {
            this.profileId = profileId;
        }

        public Builder civCode(String civCode) {
            this.civCode = civCode;
            return this;
        }

        public Builder opponentCiv(String opponentCiv) {
            this.opponentCiv = opponentCiv;
            return this;
        }

        public Builder leaderboard(String leaderboard) {
            this.leaderboard = leaderboard;
            return this;
        }

        public Builder patchNumber(Integer patchNumber) {
            this.patchNumber = patchNumber;
            return this;
        }

        public Builder dateFrom(Instant dateFrom) {
            this.dateFrom = dateFrom;
            return this;
        }

        public Builder dateTo(Instant dateTo) {
            this.dateTo = dateTo;
            return this;
        }

        public Builder resources(List<String> resources) {
            this.resources = resources;
            return this;
        }

        public Builder minuteFrom(Integer minuteFrom) {
            this.minuteFrom = minuteFrom;
            return this;
        }

        public Builder minuteTo(Integer minuteTo) {
            this.minuteTo = minuteTo;
            return this;
        }

        public Builder ratingMin(Integer ratingMin) {
            this.ratingMin = ratingMin;
            return this;
        }

        public Builder ratingMax(Integer ratingMax) {
            this.ratingMax = ratingMax;
            return this;
        }

        public AnalyticsFilter build() {
            return new AnalyticsFilter(this);
        }
    }
}
