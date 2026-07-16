package com.aoe4.analytics.service;

import com.aoe4.common.dto.AnalyticsViews.MetaFiltersView;
import com.aoe4.common.dto.AnalyticsViews.MetaOption;
import com.aoe4.persistence.entity.DimCivilization;
import com.aoe4.persistence.entity.DimLeaderboard;
import com.aoe4.persistence.entity.DimMap;
import com.aoe4.persistence.entity.DimPatch;
import com.aoe4.persistence.entity.DimResourceType;
import com.aoe4.persistence.repository.DimCivilizationRepository;
import com.aoe4.persistence.repository.DimLeaderboardRepository;
import com.aoe4.persistence.repository.DimMapRepository;
import com.aoe4.persistence.repository.DimPatchRepository;
import com.aoe4.persistence.repository.DimResourceTypeRepository;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;

@Service
public class MetaService {

    private final DimCivilizationRepository dimCivilizationRepository;
    private final DimMapRepository dimMapRepository;
    private final DimLeaderboardRepository dimLeaderboardRepository;
    private final DimPatchRepository dimPatchRepository;
    private final DimResourceTypeRepository dimResourceTypeRepository;

    public MetaService(DimCivilizationRepository dimCivilizationRepository,
                       DimMapRepository dimMapRepository,
                       DimLeaderboardRepository dimLeaderboardRepository,
                       DimPatchRepository dimPatchRepository,
                       DimResourceTypeRepository dimResourceTypeRepository) {
        this.dimCivilizationRepository = dimCivilizationRepository;
        this.dimMapRepository = dimMapRepository;
        this.dimLeaderboardRepository = dimLeaderboardRepository;
        this.dimPatchRepository = dimPatchRepository;
        this.dimResourceTypeRepository = dimResourceTypeRepository;
    }

    public MetaFiltersView getFilters() {
        return new MetaFiltersView(
                listCivilizations(),
                listMaps(),
                listLeaderboards(),
                listPatches(),
                listResourceTypes()
        );
    }

    public List<MetaOption> listCivilizations() {
        return dimCivilizationRepository.findAll().stream()
                .sorted(Comparator.comparing(DimCivilization::getCivCode))
                .map(c -> new MetaOption(c.getCivCode(), c.getCivName()))
                .toList();
    }

    public List<MetaOption> listMaps() {
        return dimMapRepository.findAll().stream()
                .sorted(Comparator.comparing(DimMap::getMapName))
                .map(m -> new MetaOption(String.valueOf(m.getMapId()), m.getMapName()))
                .toList();
    }

    public List<MetaOption> listLeaderboards() {
        return dimLeaderboardRepository.findAll().stream()
                .sorted(Comparator.comparing(DimLeaderboard::getLeaderboardCode))
                .map(l -> new MetaOption(l.getLeaderboardCode(), l.getDisplayName()))
                .toList();
    }

    public List<MetaOption> listPatches() {
        return dimPatchRepository.findAll().stream()
                .sorted(Comparator.comparing(DimPatch::getPatchNumber).reversed())
                .map(p -> new MetaOption(String.valueOf(p.getPatchNumber()), "Patch " + p.getPatchNumber()))
                .toList();
    }

    public List<MetaOption> listResourceTypes() {
        return dimResourceTypeRepository.findAll().stream()
                .sorted(Comparator.comparing(DimResourceType::getResourceCode))
                .map(r -> new MetaOption(r.getResourceCode(), r.getDisplayName()))
                .toList();
    }
}
