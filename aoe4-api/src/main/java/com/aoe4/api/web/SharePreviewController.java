package com.aoe4.api.web;

import com.aoe4.analytics.service.SharePreviewService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

@Controller
public class SharePreviewController {

    private final SharePreviewService sharePreviewService;

    public SharePreviewController(SharePreviewService sharePreviewService) {
        this.sharePreviewService = sharePreviewService;
    }

    @GetMapping(value = "/share/player/{profileId}/games/{gameId}", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> shareGame(@PathVariable long profileId,
                                            @PathVariable long gameId,
                                            @RequestParam(required = false) Long opponent,
                                            HttpServletRequest request) {
        String publicBaseUrl = resolvePublicBaseUrl(request);
        String html = sharePreviewService.renderGameSharePage(profileId, gameId, opponent, publicBaseUrl);
        return ResponseEntity.ok().contentType(MediaType.TEXT_HTML).body(html);
    }

    private static String resolvePublicBaseUrl(HttpServletRequest request) {
        String forwardedProto = request.getHeader("X-Forwarded-Proto");
        String forwardedHost = request.getHeader("X-Forwarded-Host");
        if (forwardedHost != null && !forwardedHost.isBlank()) {
            String scheme = forwardedProto != null && !forwardedProto.isBlank() ? forwardedProto : "https";
            return scheme + "://" + forwardedHost.split(",")[0].trim();
        }
        return request.getRequestURL().toString().replace(request.getRequestURI(), "");
    }
}
