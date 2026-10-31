package com.aoe4.persistence;

import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

@Configuration
@EnableJpaRepositories(basePackages = "com.aoe4.persistence.repository")
@EntityScan(basePackages = "com.aoe4.persistence.entity")
public class PersistenceConfiguration {
}
