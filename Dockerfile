# syntax=docker/dockerfile:1

FROM node:22-alpine AS frontend
WORKDIR /fe
COPY aoe4-frontend/package.json aoe4-frontend/package-lock.json ./
RUN npm ci
COPY aoe4-frontend/ ./
RUN npm run build

FROM maven:3.9-eclipse-temurin-17 AS backend
WORKDIR /app
COPY pom.xml ./
COPY aoe4-common/pom.xml aoe4-common/
COPY aoe4-persistence/pom.xml aoe4-persistence/
COPY aoe4-ingest/pom.xml aoe4-ingest/
COPY aoe4-analytics-service/pom.xml aoe4-analytics-service/
COPY aoe4-api/pom.xml aoe4-api/
COPY aoe4-common/ aoe4-common/
COPY aoe4-persistence/ aoe4-persistence/
COPY aoe4-ingest/ aoe4-ingest/
COPY aoe4-analytics-service/ aoe4-analytics-service/
COPY aoe4-api/ aoe4-api/
COPY --from=frontend /fe/dist ./aoe4-api/src/main/resources/static/
RUN mvn -q -pl aoe4-api -am package -DskipTests

FROM eclipse-temurin:17-jre-jammy
WORKDIR /app
COPY --from=backend /app/aoe4-api/target/aoe4-api-*.jar app.jar
ENV SPRING_PROFILES_ACTIVE=prod
VOLUME ["/app/data"]
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
