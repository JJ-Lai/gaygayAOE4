package com.aoe4.api.web;

import com.aoe4.common.dto.ApiViews.SummaryApiKeyRequest;
import com.aoe4.common.dto.ApiViews.SummaryApiKeyStatusView;
import com.aoe4.ingest.config.SummaryApiKeyStore;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/settings")
public class SettingsController {

    private final SummaryApiKeyStore summaryApiKeyStore;

    public SettingsController(SummaryApiKeyStore summaryApiKeyStore) {
        this.summaryApiKeyStore = summaryApiKeyStore;
    }

    @GetMapping("/summary-api-key")
    public SummaryApiKeyStatusView getSummaryApiKeyStatus() {
        return new SummaryApiKeyStatusView(
                summaryApiKeyStore.isConfigured(),
                summaryApiKeyStore.maskedSuffix(),
                summaryApiKeyStore.isRuntimeOverride()
        );
    }

    @PutMapping("/summary-api-key")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void setSummaryApiKey(@RequestBody SummaryApiKeyRequest request) {
        if (request.apiKey() == null || request.apiKey().isBlank()) {
            throw new IllegalArgumentException("apiKey is required");
        }
        summaryApiKeyStore.setRuntimeApiKey(request.apiKey());
    }

    @DeleteMapping("/summary-api-key")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void clearSummaryApiKey() {
        summaryApiKeyStore.clearRuntimeApiKey();
    }
}
