package com.aoe4.analytics.service;

import com.aoe4.common.config.Aoe4Properties;
import com.aoe4.common.dto.ApiViews.SyncAlertView;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SyncAlertNotifierTest {

    @Mock
    private Aoe4Properties properties;

    @Mock
    private Aoe4Properties.Ops ops;

    private SyncAlertNotifier notifier;

    @BeforeEach
    void setUp() {
        when(properties.getOps()).thenReturn(ops);
        notifier = new SyncAlertNotifier(properties, new ObjectMapper());
    }

    @Test
    void skipsWhenWebhookDisabled() {
        when(ops.isAlertWebhookEnabled()).thenReturn(false);

        var result = notifier.notifyIfNeeded(sampleAlerts(), true);

        assertThat(result.sent()).isFalse();
        assertThat(result.reason()).isEqualTo("webhook_disabled");
    }

    @Test
    void skipsWhenNoAlerts() {
        when(ops.isAlertWebhookEnabled()).thenReturn(true);
        when(ops.getAlertWebhookUrl()).thenReturn("https://example.com/hook");

        var result = notifier.notifyIfNeeded(List.of(), true);

        assertThat(result.sent()).isFalse();
        assertThat(result.reason()).isEqualTo("no_alerts");
    }

    @Test
    void skipsWhenWebhookUrlMissing() {
        when(ops.isAlertWebhookEnabled()).thenReturn(true);
        when(ops.getAlertWebhookUrl()).thenReturn("  ");

        var result = notifier.notifyIfNeeded(sampleAlerts(), true);

        assertThat(result.sent()).isFalse();
        assertThat(result.reason()).isEqualTo("webhook_url_missing");
    }

    private static List<SyncAlertView> sampleAlerts() {
        return List.of(new SyncAlertView("WARNING", "HIGH_FAILURE_COUNT", "failures high", 12));
    }
}
