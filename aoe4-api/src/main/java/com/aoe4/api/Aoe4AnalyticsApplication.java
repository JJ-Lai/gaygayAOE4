package com.aoe4.api;

import com.aoe4.analytics.AnalyticsConfiguration;
import com.aoe4.ingest.IngestConfiguration;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Import;

@SpringBootApplication
@Import({IngestConfiguration.class, AnalyticsConfiguration.class})
public class Aoe4AnalyticsApplication {

    public static void main(String[] args) {
        SpringApplication.run(Aoe4AnalyticsApplication.class, args);
    }
}
