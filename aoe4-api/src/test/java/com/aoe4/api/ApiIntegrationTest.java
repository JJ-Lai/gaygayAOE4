package com.aoe4.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.jdbc.Sql;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Sql(scripts = "/sql/integration-test-data.sql")
class ApiIntegrationTest {

    @Autowired
    private TestRestTemplate restTemplate;

    @Test
    void healthEndpointIsUp() {
        ResponseEntity<Map> response = restTemplate.getForEntity("/actuator/health", Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).containsEntry("status", "UP");
    }

    @Test
    void playerOverviewComputesStats() {
        ResponseEntity<Map> response = restTemplate.getForEntity(
                "/api/v1/analytics/overview?profileId=10861747",
                Map.class
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().get("totalGames")).isEqualTo(2);
        assertThat(response.getBody().get("wins")).isEqualTo(1);
        assertThat(response.getBody().get("losses")).isEqualTo(1);
        assertThat(((Number) response.getBody().get("winRate")).doubleValue()).isEqualTo(0.5);
    }

    @Test
    void syncOverviewReturnsAggregateCounts() {
        ResponseEntity<Map> response = restTemplate.getForEntity("/api/v1/ops/sync-overview", Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().get("totalPlayers")).isEqualTo(3);
        assertThat(response.getBody().get("totalGames")).isEqualTo(2);
        assertThat(response.getBody().get("alerts")).isNotNull();
    }

    @Test
    void queryPlansExplainForExistingPlayer() {
        ResponseEntity<Map> response = restTemplate.getForEntity(
                "/api/v1/ops/query-plans?profileId=10861747",
                Map.class
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isNotNull();
        assertThat(((Number) response.getBody().get("profileId")).longValue()).isEqualTo(10861747L);
        assertThat(((java.util.List<?>) response.getBody().get("plans")).size()).isGreaterThanOrEqualTo(7);
    }

    @Test
    void unknownPlayerReturnsNotFound() {
        ResponseEntity<Map> response = restTemplate.getForEntity(
                "/api/v1/analytics/overview?profileId=1",
                Map.class
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void reparseSummariesEndpointAcceptsRequest() {
        ResponseEntity<Map> response = restTemplate.postForEntity(
                "/api/v1/ops/reparse-summaries?profileId=10861747&maxGames=5",
                null,
                Map.class
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().get("attempted")).isNotNull();
    }

    @Test
    void gameTimelineIncludesOpponentWhenAvailable() {
        ResponseEntity<Map> response = restTemplate.getForEntity(
                "/api/v1/games/91001/timeline?profileId=10861747",
                Map.class
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().get("opponent")).isNotNull();
        Map<?, ?> opponent = (Map<?, ?>) response.getBody().get("opponent");
        assertThat(((Number) opponent.get("profileId")).longValue()).isEqualTo(999999L);
        assertThat(((java.util.List<?>) opponent.get("buildEvents")).size()).isEqualTo(1);
        assertThat(((java.util.List<?>) response.getBody().get("availableOpponents")).size()).isEqualTo(2);
        @SuppressWarnings("unchecked")
        java.util.List<Map<String, Object>> opponents =
                (java.util.List<Map<String, Object>>) response.getBody().get("availableOpponents");
        assertThat(opponents.stream().anyMatch(o -> "opponent".equals(o.get("relationship")))).isTrue();
        assertThat(opponents.stream().anyMatch(o -> "teammate".equals(o.get("relationship")))).isTrue();
    }

    @Test
    void gameTimelineSelectsRequestedOpponent() {
        ResponseEntity<Map> response = restTemplate.getForEntity(
                "/api/v1/games/91001/timeline?profileId=10861747&opponentProfileId=888888",
                Map.class
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        Map<?, ?> opponent = (Map<?, ?>) response.getBody().get("opponent");
        assertThat(((Number) opponent.get("profileId")).longValue()).isEqualTo(888888L);
    }

    @Test
    void sharePreviewReturnsHtmlWithOgTags() {
        ResponseEntity<String> response = restTemplate.getForEntity(
                "/share/player/10861747/games/91001",
                String.class
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).contains("og:title");
        assertThat(response.getBody()).contains("og:image");
        assertThat(response.getBody()).contains("對戰 #91001");
    }
}
