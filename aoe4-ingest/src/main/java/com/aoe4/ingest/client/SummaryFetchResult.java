package com.aoe4.ingest.client;

public final class SummaryFetchResult {

    public enum Status {
        SUCCESS,
        NOT_FOUND,
        RATE_LIMITED,
        ERROR
    }

    private final Status status;
    private final String payload;
    private final String errorMessage;
    private final boolean fromCache;
    private final int httpStatus;

    private SummaryFetchResult(Status status, String payload, String errorMessage, boolean fromCache, int httpStatus) {
        this.status = status;
        this.payload = payload;
        this.errorMessage = errorMessage;
        this.fromCache = fromCache;
        this.httpStatus = httpStatus;
    }

    public static SummaryFetchResult success(String payload, boolean fromCache) {
        return new SummaryFetchResult(Status.SUCCESS, payload, null, fromCache, 200);
    }

    public static SummaryFetchResult notFound(String message) {
        return new SummaryFetchResult(Status.NOT_FOUND, null, message, false, 404);
    }

    public static SummaryFetchResult rateLimited(String message) {
        return new SummaryFetchResult(Status.RATE_LIMITED, null, message, false, 429);
    }

    public static SummaryFetchResult error(String message, int httpStatus) {
        return new SummaryFetchResult(Status.ERROR, null, message, false, httpStatus);
    }

    public Status getStatus() {
        return status;
    }

    public String getPayload() {
        return payload;
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public boolean isFromCache() {
        return fromCache;
    }

    public int getHttpStatus() {
        return httpStatus;
    }

    public boolean isSuccess() {
        return status == Status.SUCCESS;
    }
}
