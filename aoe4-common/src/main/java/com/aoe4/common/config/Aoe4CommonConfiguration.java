package com.aoe4.common.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(Aoe4Properties.class)
@ComponentScan(basePackages = "com.aoe4.common")
public class Aoe4CommonConfiguration {
}
