package com.aoe4.analytics.service;

public class GameNotFoundException extends RuntimeException {

    public GameNotFoundException(long gameId) {
        super("Game not found: " + gameId);
    }
}
