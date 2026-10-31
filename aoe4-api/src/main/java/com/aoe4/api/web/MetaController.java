package com.aoe4.api.web;

import com.aoe4.analytics.service.MetaService;
import com.aoe4.common.dto.AnalyticsViews.MetaFiltersView;
import com.aoe4.common.dto.AnalyticsViews.MetaOption;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/meta")
public class MetaController {

    private final MetaService metaService;

    public MetaController(MetaService metaService) {
        this.metaService = metaService;
    }

    @GetMapping("/filters")
    public MetaFiltersView filters() {
        return metaService.getFilters();
    }

    @GetMapping("/civilizations")
    public List<MetaOption> civilizations() {
        return metaService.listCivilizations();
    }

    @GetMapping("/maps")
    public List<MetaOption> maps() {
        return metaService.listMaps();
    }
}
