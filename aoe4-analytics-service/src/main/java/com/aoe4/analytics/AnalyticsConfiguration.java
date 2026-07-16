package com.aoe4.analytics;

import com.aoe4.persistence.PersistenceConfiguration;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

@Configuration
@Import(PersistenceConfiguration.class)
@ComponentScan(basePackages = "com.aoe4.analytics")
public class AnalyticsConfiguration {
}
