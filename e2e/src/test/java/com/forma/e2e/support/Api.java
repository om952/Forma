package com.forma.e2e.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Setup through the public API, for everything a scenario needs to exist
 * before the part it is actually about: accounts, forms, responses. Faster
 * than clicking through the UI and not what is under test.
 */
public final class Api {

  public static final String PASSWORD = "e2e-password-1";

  public record Reply(int status, JsonNode body) {}

  private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
  private final ObjectMapper json = new ObjectMapper();
  private final String base;

  public Api(String base) {
    this.base = base;
  }

  public Reply send(String method, String path, String token, Object body, Map<String, String> headers) {
    try {
      HttpRequest.Builder request =
          HttpRequest.newBuilder(URI.create(base + path)).timeout(Duration.ofSeconds(30));
      if (token != null) request.header("Authorization", "Bearer " + token);
      headers.forEach(request::header);
      if (body != null) {
        request.header("Content-Type", "application/json");
        request.method(method, HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
      } else {
        request.method(method, HttpRequest.BodyPublishers.noBody());
      }
      HttpResponse<String> response = http.send(request.build(), HttpResponse.BodyHandlers.ofString());
      JsonNode parsed = response.body().isBlank() ? json.nullNode() : json.readTree(response.body());
      return new Reply(response.statusCode(), parsed);
    } catch (IOException e) {
      throw new IllegalStateException(method + " " + path + " failed: " + e.getMessage(), e);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException(method + " " + path + " was interrupted", e);
    }
  }

  public Reply send(String method, String path, String token, Object body) {
    return send(method, path, token, body, Map.of());
  }

  private JsonNode expect(int status, Reply reply, String what) {
    if (reply.status() != status) {
      throw new IllegalStateException(what + ": expected " + status + ", got " + reply.status() + " " + reply.body());
    }
    return reply.body();
  }

  /** A short suffix that makes names unique across runs against the same stack. */
  public static String unique() {
    return Long.toString(System.currentTimeMillis(), 36)
        + Integer.toString(ThreadLocalRandom.current().nextInt(36 * 36 * 36), 36);
  }

  /** A new organization and its owner. */
  public Actor signUp(String name) {
    String suffix = unique();
    String email = "owner-" + suffix + "@e2e.test";
    String orgName = "E2E Org " + suffix;
    JsonNode body =
        expect(
            201,
            send("POST", "/api/auth/signup", null, Map.of("email", email, "password", PASSWORD, "organizationName", orgName)),
            "sign up");
    return actorFrom(name, email, PASSWORD, orgName, body);
  }

  /** Invites someone into {@code owner}'s organization and accepts on their behalf. */
  public Actor addMember(Actor owner, String role, String name) {
    String email = role.toLowerCase() + "-" + unique() + "@e2e.test";
    JsonNode invite =
        expect(201, send("POST", "/api/org/invites", owner.token(), Map.of("email", email, "role", role)), "invite");
    String link = invite.path("inviteUrl").asText();
    if (link.isEmpty()) {
      throw new IllegalStateException("No invite link returned; is email switched off on the stack under test?");
    }
    String token = link.substring(link.indexOf('#') + 1);
    JsonNode accepted =
        expect(
            201,
            send("POST", "/api/invites/accept", null, Map.of("token", token, "password", PASSWORD, "name", name)),
            "accept invite");
    return actorFrom(name, email, PASSWORD, owner.orgName(), accepted);
  }

  private Actor actorFrom(String name, String email, String password, String orgName, JsonNode body) {
    JsonNode user = body.path("user");
    return new Actor(
        name,
        email,
        password,
        body.path("token").asText(),
        user.path("id").asText(),
        user.path("orgId").asText(),
        orgName,
        user.path("role").asText(),
        user.toString());
  }

  /** The default form: a required name and an optional email. */
  public static List<Map<String, Object>> defaultQuestions() {
    return List.of(
        Map.of("id", "name", "type", "text", "label", "Your name", "required", true),
        Map.of("id", "email", "type", "email", "label", "Email", "required", false));
  }

  public String createForm(Actor actor, String title, List<Map<String, Object>> questions, String thankYou) {
    Map<String, Object> body =
        thankYou == null
            ? Map.of("title", title, "schema", questions)
            : Map.of("title", title, "schema", questions, "thankYouMessage", thankYou);
    return expect(201, send("POST", "/api/forms", actor.token(), body), "create form").path("id").asText();
  }

  public void updateQuestions(Actor actor, String formId, List<Map<String, Object>> questions) {
    expect(200, send("PATCH", "/api/forms/" + formId, actor.token(), Map.of("schema", questions)), "update form");
  }

  public String submit(String formId, Map<String, String> answers) {
    return expect(201, send("POST", "/api/responses/" + formId, null, answers), "submit").path("id").asText();
  }

  public String createWebhook(Actor actor, String formId, String url) {
    return expect(201, send("POST", "/api/webhooks", actor.token(), Map.of("formId", formId, "url", url)), "create webhook")
        .path("id")
        .asText();
  }

  public int status(String method, String path, String token) {
    return send(method, path, token, null).status();
  }
}
