package com.forma.e2e.support;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.Base64;
import java.util.HexFormat;

/**
 * Direct access to the stack's Postgres, only for what a test stack has no
 * other way to do: there is no payment provider to upgrade an organization, no
 * inbox to read emailed links from, and no remote endpoint that reliably
 * fails. Everything a user can do is done through the browser or the API.
 */
public final class Database implements AutoCloseable {

  private final Config config;
  private Connection connection;

  public Database(Config config) {
    this.config = config;
  }

  private Connection connection() throws SQLException {
    if (connection == null || connection.isClosed()) {
      if (config.dbPassword().isBlank()) {
        throw new IllegalStateException("Set E2E_DB_PASSWORD to the test stack's POSTGRES_PASSWORD");
      }
      connection = DriverManager.getConnection(config.dbUrl(), config.dbUser(), config.dbPassword());
      // The app stores UTC in columns without a time zone. The driver would
      // otherwise use this JVM's zone, and now() would land hours off.
      try (var statement = connection.createStatement()) {
        statement.execute("SET TIME ZONE 'UTC'");
      }
    }
    return connection;
  }

  private int update(String sql, Object... args) {
    try (PreparedStatement statement = connection().prepareStatement(sql)) {
      for (int i = 0; i < args.length; i++) statement.setObject(i + 1, args[i]);
      return statement.executeUpdate();
    } catch (SQLException e) {
      throw new IllegalStateException("Database update failed: " + e.getMessage(), e);
    }
  }

  /** A single number from a query, e.g. a count to wait on. */
  public long number(String sql, Object... args) {
    try (PreparedStatement statement = connection().prepareStatement(sql)) {
      for (int i = 0; i < args.length; i++) statement.setObject(i + 1, args[i]);
      try (var rows = statement.executeQuery()) {
        return rows.next() ? rows.getLong(1) : 0;
      }
    } catch (SQLException e) {
      throw new IllegalStateException("Database query failed: " + e.getMessage(), e);
    }
  }

  /** What a successful Razorpay subscription would do. */
  public void makePremium(String orgId) {
    update("UPDATE \"Organization\" SET tier = 'PREMIUM' WHERE id = ?", orgId);
  }

  /** Deliveries that exhausted their retries, as the webhook worker records them. */
  public void addFailedDeliveries(String orgId, String formId, String webhookId, String url, int count) {
    for (int i = 1; i <= count; i++) {
      update(
          "INSERT INTO \"WebhookDeadLetter\" (id, \"orgId\", \"formId\", \"webhookId\", url, payload, \"lastError\", \"attemptsMade\", \"failedAt\")"
              + " VALUES (?, ?, ?, ?, ?, '{}'::jsonb, ?, 3, now() - make_interval(mins => ?))",
          "e2e-dl-" + Api.unique() + "-" + i,
          orgId,
          formId,
          webhookId,
          url,
          "HTTP 500 Internal Server Error (attempt " + i + ")",
          i);
    }
  }

  /**
   * A one-time link token as the app would email it: the random token is
   * returned and only its SHA-256 is stored, exactly like services/accountTokens.ts.
   *
   * @param purpose {@code PASSWORD_RESET} or {@code EMAIL_VERIFICATION}
   */
  public String issueLinkToken(String userId, String purpose) {
    byte[] random = new byte[32];
    new SecureRandom().nextBytes(random);
    String token = Base64.getUrlEncoder().withoutPadding().encodeToString(random);
    update(
        "INSERT INTO \"AuthToken\" (id, \"userId\", purpose, \"tokenHash\", \"expiresAt\")"
            + " VALUES (?, ?, ?::\"AuthTokenPurpose\", ?, now() + interval '1 hour')",
        "e2e-tok-" + Api.unique(),
        userId,
        purpose,
        sha256(token));
    return token;
  }

  /** Makes unfinished visits look 45 minutes old, past the 30-minute abandon threshold. */
  public void letUnfinishedVisitsGoIdle(String formId) {
    update(
        "UPDATE \"FormSession\" SET \"lastActiveAt\" = now() - interval '45 minutes'"
            + " WHERE \"formId\" = ? AND \"submittedAt\" IS NULL",
        formId);
  }

  private static String sha256(String value) {
    try {
      return HexFormat.of()
          .formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }

  @Override
  public void close() {
    try {
      if (connection != null) connection.close();
    } catch (SQLException ignored) {
      // Closing at the end of a scenario; nothing to do about a failure.
    }
  }
}
