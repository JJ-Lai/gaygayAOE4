package com.aoe4.analytics.service;

public class PlayerNotFoundException extends RuntimeException {
    public PlayerNotFoundException(long profileId) {
        super("Player not found: " + profileId);
    }
}
