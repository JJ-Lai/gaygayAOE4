package com.aoe4.analytics.service;

import com.aoe4.common.dto.AnalyticsViews.GameTimelineView;
import com.aoe4.common.dto.ApiViews.GameDetailView;
import org.springframework.stereotype.Service;

@Service
public class SharePreviewService {

    private final GameQueryService gameQueryService;
    private final AnalyticsService analyticsService;

    public SharePreviewService(GameQueryService gameQueryService, AnalyticsService analyticsService) {
        this.gameQueryService = gameQueryService;
        this.analyticsService = analyticsService;
    }

    public String renderGameSharePage(long profileId, long gameId, Long opponentProfileId, String publicBaseUrl) {
        GameDetailView detail = gameQueryService.getGameDetail(gameId, profileId);
        GameTimelineView timeline = analyticsService.getGameTimeline(gameId, profileId, opponentProfileId);

        String mapName = detail.game().mapName() != null ? detail.game().mapName() : "未知地圖";
        String mode = detail.game().leaderboardCode() != null ? detail.game().leaderboardCode() : "";
        String title = "對戰 #" + gameId + " · " + mapName;

        StringBuilder description = new StringBuilder();
        description.append("地圖 ").append(mapName);
        if (!mode.isBlank()) {
            description.append(" · ").append(mode);
        }
        if (timeline.opponent() != null && timeline.opponent().playerName() != null) {
            description.append(" · 對手 ").append(timeline.opponent().playerName());
        }
        if (detail.hasSummary()) {
            description.append(" · 含 Summary 雙方對比");
        }

        String targetPath = "/player/" + profileId + "/games/" + gameId
                + (opponentProfileId != null ? "?opponent=" + opponentProfileId : "");
        String sharePath = "/share/player/" + profileId + "/games/" + gameId
                + (opponentProfileId != null ? "?opponent=" + opponentProfileId : "");
        String ogImage = publicBaseUrl != null && !publicBaseUrl.isBlank()
                ? publicBaseUrl.replaceAll("/$", "") + "/og-share.svg"
                : "/og-share.svg";
        String ogUrl = publicBaseUrl != null && !publicBaseUrl.isBlank()
                ? publicBaseUrl.replaceAll("/$", "") + sharePath
                : sharePath;

        return """
                <!DOCTYPE html>
                <html lang="zh-Hant">
                <head>
                  <meta charset="UTF-8"/>
                  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
                  <title>%s</title>
                  <meta name="description" content="%s"/>
                  <meta property="og:type" content="website"/>
                  <meta property="og:title" content="%s"/>
                  <meta property="og:description" content="%s"/>
                  <meta property="og:url" content="%s"/>
                  <meta property="og:image" content="%s"/>
                  <meta name="twitter:card" content="summary_large_image"/>
                  <meta name="twitter:image" content="%s"/>
                  <meta http-equiv="refresh" content="0;url=%s"/>
                </head>
                <body>
                  <p><a href="%s">前往 AOE4 對戰分析</a></p>
                </body>
                </html>
                """.formatted(
                escape(title),
                escape(description.toString()),
                escape(title),
                escape(description.toString()),
                escape(ogUrl),
                escape(ogImage),
                escape(ogImage),
                escape(targetPath),
                escape(targetPath)
        );
    }

    private static String escape(String value) {
        return value
                .replace("&", "&amp;")
                .replace("\"", "&quot;")
                .replace("<", "&lt;")
                .replace(">", "&gt;");
    }
}
