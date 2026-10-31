package com.aoe4.api.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig {

    @Value("${aoe4.frontend.spa-enabled:false}")
    private boolean spaEnabled;

    @Bean
    public WebMvcConfigurer webMvcConfigurer() {
        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/api/**")
                        .allowedOriginPatterns(
                                "http://localhost:*",
                                "http://127.0.0.1:*"
                        )
                        .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                        .allowedHeaders("*");
            }

            @Override
            public void addResourceHandlers(ResourceHandlerRegistry registry) {
                if (!spaEnabled) {
                    return;
                }
                registry.addResourceHandler("/**")
                        .addResourceLocations("classpath:/static/")
                        .resourceChain(true);
            }

            @Override
            public void addViewControllers(ViewControllerRegistry registry) {
                if (!spaEnabled) {
                    return;
                }
                registry.addViewController("/{spring:^(?!api|share|h2-console|swagger-ui|api-docs|actuator).*$}")
                        .setViewName("forward:/index.html");
                registry.addViewController("/**/{spring:^(?!api|share|h2-console|swagger-ui|api-docs|actuator).*$}")
                        .setViewName("forward:/index.html");
            }
        };
    }
}
