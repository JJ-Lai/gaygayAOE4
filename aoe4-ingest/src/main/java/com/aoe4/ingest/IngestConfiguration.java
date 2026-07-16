package com.aoe4.ingest;

import com.aoe4.common.config.Aoe4CommonConfiguration;
import com.aoe4.persistence.PersistenceConfiguration;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

@Configuration
@Import({Aoe4CommonConfiguration.class, PersistenceConfiguration.class})
@ComponentScan(basePackages = "com.aoe4.ingest")
public class IngestConfiguration {
}
