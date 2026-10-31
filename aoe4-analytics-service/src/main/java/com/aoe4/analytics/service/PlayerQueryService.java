package com.aoe4.analytics.service;

import com.aoe4.common.dto.ApiViews.PlayerView;
import com.aoe4.persistence.entity.DimPlayer;
import com.aoe4.persistence.repository.DimPlayerRepository;
import org.springframework.stereotype.Service;

@Service
public class PlayerQueryService {

    private final DimPlayerRepository dimPlayerRepository;

    public PlayerQueryService(DimPlayerRepository dimPlayerRepository) {
        this.dimPlayerRepository = dimPlayerRepository;
    }

    public PlayerView findPlayer(long profileId) {
        DimPlayer player = dimPlayerRepository.findById(profileId)
                .orElseThrow(() -> new PlayerNotFoundException(profileId));
        return new PlayerView(player.getProfileId(), player.getName(), player.getCountry(), player.getSteamId());
    }
}
