package com.aoe4.ingest.service;

import com.aoe4.persistence.entity.DimBuilding;
import com.aoe4.persistence.entity.DimTechnology;
import com.aoe4.persistence.entity.DimUnit;
import com.aoe4.persistence.entity.FactBuildEvent;
import com.aoe4.persistence.entity.FactGamePlayerArmyValue;
import com.aoe4.persistence.entity.FactGamePlayerResource;
import com.aoe4.persistence.entity.FactGamePlayerScore;
import com.aoe4.persistence.repository.DimBuildingRepository;
import com.aoe4.persistence.repository.DimTechnologyRepository;
import com.aoe4.persistence.repository.DimPlayerRepository;
import com.aoe4.persistence.repository.DimUnitRepository;
import com.aoe4.persistence.repository.FactBuildEventRepository;
import com.aoe4.persistence.repository.FactGamePlayerArmyValueRepository;
import com.aoe4.persistence.repository.FactGamePlayerResourceRepository;
import com.aoe4.persistence.repository.FactGamePlayerScoreRepository;
import com.aoe4.persistence.repository.FactPlayerCombatStatsRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SummaryParserTest {

    @Mock
    private FactGamePlayerScoreRepository scoreRepository;
    @Mock
    private FactPlayerCombatStatsRepository combatStatsRepository;
    @Mock
    private FactGamePlayerResourceRepository resourceRepository;
    @Mock
    private FactGamePlayerArmyValueRepository armyValueRepository;
    @Mock
    private FactBuildEventRepository buildEventRepository;
    @Mock
    private DimUnitRepository dimUnitRepository;
    @Mock
    private DimBuildingRepository dimBuildingRepository;
    @Mock
    private DimTechnologyRepository dimTechnologyRepository;
    @Mock
    private DimPlayerRepository dimPlayerRepository;

    private SummaryParser parser;
    private String sampleJson;

    @BeforeEach
    void setUp() throws Exception {
        parser = new SummaryParser(
                new ObjectMapper(),
                scoreRepository,
                combatStatsRepository,
                resourceRepository,
                armyValueRepository,
                buildEventRepository,
                dimUnitRepository,
                dimBuildingRepository,
                dimTechnologyRepository,
                dimPlayerRepository
        );
        Path samplePath = Path.of("..", "samples", "players", "public-game-131766848-summary.json");
        sampleJson = Files.readString(samplePath);
        lenient().when(dimUnitRepository.findById(any())).thenReturn(java.util.Optional.empty());
        lenient().when(dimBuildingRepository.findById(any())).thenReturn(java.util.Optional.empty());
        lenient().when(dimTechnologyRepository.findById(any())).thenReturn(java.util.Optional.empty());
        lenient().when(dimPlayerRepository.existsById(any())).thenReturn(true);
    }

    @Test
    void parsesSampleSummaryMetadata() {
        var summary = parser.parse(sampleJson);
        assertThat(summary.gameId()).isEqualTo(131766848L);
        assertThat(summary.players()).hasSize(2);
        assertThat(summary.players().get(0).scores().total()).isPositive();
    }

    @Test
    void persistsResourceTimelineAndBuildEvents() {
        SummaryParser.ParseStats stats = parser.persist(131766848L, sampleJson);

        assertThat(stats.playersParsed()).isEqualTo(2);
        assertThat(stats.resourceDataPoints()).isGreaterThan(100);
        assertThat(stats.buildEvents()).isGreaterThan(100);

        ArgumentCaptor<List<FactGamePlayerResource>> resourceCaptor = ArgumentCaptor.forClass(List.class);
        verify(resourceRepository, atLeastOnce()).saveAll(resourceCaptor.capture());
        List<FactGamePlayerResource> allResources = resourceCaptor.getAllValues().stream()
                .flatMap(List::stream)
                .toList();
        assertThat(allResources.stream().anyMatch(r ->
                "wood".equals(r.getResourceCode()) && r.getSecondMark() == 60 && r.getAccumulatedValue() == 50
        )).isTrue();

        verify(scoreRepository, atLeastOnce()).save(any(FactGamePlayerScore.class));
        verify(combatStatsRepository, atLeastOnce()).save(any());
        verify(armyValueRepository, atLeastOnce()).saveAll(any());
        verify(buildEventRepository, atLeastOnce()).saveAll(any());
        verify(dimUnitRepository, atLeastOnce()).save(any(DimUnit.class));
        verify(dimBuildingRepository, atLeastOnce()).save(any(DimBuilding.class));
        verify(dimTechnologyRepository, atLeastOnce()).save(any(DimTechnology.class));
    }

    @Test
    void persistsDestroyedBuildEvents() {
        parser.persist(131766848L, sampleJson);

        ArgumentCaptor<List<FactBuildEvent>> buildCaptor = ArgumentCaptor.forClass(List.class);
        verify(buildEventRepository, atLeastOnce()).saveAll(buildCaptor.capture());
        boolean hasDestroyed = buildCaptor.getAllValues().stream()
                .flatMap(List::stream)
                .anyMatch(event -> "DESTROYED".equals(event.getEventKind()));
        assertThat(hasDestroyed).isTrue();
    }
}
