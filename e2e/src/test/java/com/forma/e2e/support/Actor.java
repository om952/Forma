package com.forma.e2e.support;

/**
 * Someone with an account: what a scenario needs to sign them in through the
 * UI ({@code email}, {@code password}) or straight away ({@code token} and
 * {@code userJson}, the stored session the web app reads).
 */
public record Actor(
    String name,
    String email,
    String password,
    String token,
    String userId,
    String orgId,
    String orgName,
    String role,
    String userJson) {

  public Actor withPassword(String newPassword, String newToken) {
    return new Actor(name, email, newPassword, newToken, userId, orgId, orgName, role, userJson);
  }
}
