package com.forma.e2e.support;

import java.time.Duration;

/**
 * Where the stack under test lives. Each setting is read from a {@code -D}
 * system property first, then from the environment variable of the same name.
 *
 * <ul>
 *   <li>{@code E2E_BASE_URL}: the web app, default {@code http://localhost:8080}</li>
 *   <li>{@code E2E_API_URL}: the API, default the web app's origin (the
 *       production stack serves both from one origin)</li>
 *   <li>{@code E2E_DB_URL}, {@code E2E_DB_USER}, {@code E2E_DB_PASSWORD}: the
 *       stack's Postgres, for setup the UI has no path for in a test stack</li>
 *   <li>{@code E2E_HEADLESS}: {@code false} to watch the browser</li>
 *   <li>{@code E2E_TIMEOUT_SECONDS}: how long to wait for the page, default 15</li>
 * </ul>
 */
public record Config(
    String baseUrl,
    String apiUrl,
    String dbUrl,
    String dbUser,
    String dbPassword,
    boolean headless,
    Duration timeout) {

  private static Config current;

  public static synchronized Config get() {
    if (current == null) {
      String base = trimSlash(setting("E2E_BASE_URL", "http://localhost:8080"));
      current =
          new Config(
              base,
              trimSlash(setting("E2E_API_URL", base)),
              setting("E2E_DB_URL", "jdbc:postgresql://localhost:55432/forma"),
              setting("E2E_DB_USER", "forma"),
              setting("E2E_DB_PASSWORD", ""),
              Boolean.parseBoolean(setting("E2E_HEADLESS", "true")),
              Duration.ofSeconds(Long.parseLong(setting("E2E_TIMEOUT_SECONDS", "15"))));
    }
    return current;
  }

  private static String setting(String name, String fallback) {
    String value = System.getProperty(name);
    if (value == null || value.isBlank()) value = System.getenv(name);
    return value == null || value.isBlank() ? fallback : value;
  }

  private static String trimSlash(String url) {
    return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
  }
}
