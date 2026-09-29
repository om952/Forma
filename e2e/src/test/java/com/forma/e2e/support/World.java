package com.forma.e2e.support;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;

/**
 * Everything one scenario shares between its step classes: the browser, the
 * people in the story, and the records they made. Cucumber's PicoContainer
 * builds a fresh one for every scenario, so scenarios never share a browser,
 * a session or data.
 */
public class World {

  public final Config config = Config.get();
  public final Api api = new Api(config.apiUrl());
  public final Database db = new Database(config);

  private final Map<String, Actor> actors = new HashMap<>();
  private WebDriver driver;
  private Path downloads;

  /** The form the scenario is about, and its title. */
  public String formId;
  public String formTitle;

  /** Something a step produced for a later step: an invite link, an email. */
  public String inviteLink;
  public String inviteEmail;

  public WebDriver driver() {
    if (driver == null) {
      ChromeOptions options = new ChromeOptions();
      if (config.headless()) options.addArguments("--headless=new");
      options.addArguments(
          "--window-size=1366,900",
          "--no-sandbox",
          "--disable-dev-shm-usage",
          "--no-first-run",
          "--no-default-browser-check",
          // A fresh profile on macOS otherwise asks the Keychain for Chrome's
          // storage key, which blocks the browser behind an invisible prompt.
          "--use-mock-keychain",
          "--password-store=basic");
      // A page that never finishes loading fails the step instead of hanging it.
      options.setPageLoadTimeout(java.time.Duration.ofSeconds(30));
      options.setExperimentalOption(
          "prefs",
          Map.of(
              "download.default_directory", downloads().toString(),
              "download.prompt_for_download", false));
      driver = new ChromeDriver(options);
    }
    return driver;
  }

  public boolean hasBrowser() {
    return driver != null;
  }

  public Path downloads() {
    if (downloads == null) {
      try {
        downloads = Files.createTempDirectory("forma-e2e-downloads");
      } catch (IOException e) {
        throw new IllegalStateException(e);
      }
    }
    return downloads;
  }

  public void remember(String role, Actor actor) {
    actors.put(role, actor);
  }

  public Actor actor(String role) {
    Actor actor = actors.get(role);
    if (actor == null) throw new IllegalStateException("No " + role + " in this scenario yet");
    return actor;
  }

  /**
   * Puts {@code actor}'s session in the browser the way the sign-in page
   * would, for scenarios where signing in is not what is being tested.
   */
  public void signInAs(Actor actor) {
    driver().get(config.baseUrl() + "/auth");
    ((JavascriptExecutor) driver())
        .executeScript(
            "localStorage.setItem('forma_token', arguments[0]);"
                + "localStorage.setItem('forma_user', arguments[1]);",
            actor.token(),
            actor.userJson());
  }

  /** A clean browser session, as if a different person sat down. */
  public void clearSession() {
    driver().get(config.baseUrl() + "/auth");
    ((JavascriptExecutor) driver()).executeScript("localStorage.clear(); sessionStorage.clear();");
    driver().manage().deleteAllCookies();
  }

  public void close() {
    if (driver != null) driver.quit();
    db.close();
    if (downloads != null) {
      try (var files = Files.walk(downloads)) {
        files.sorted((a, b) -> b.compareTo(a)).forEach(path -> path.toFile().delete());
      } catch (IOException ignored) {
        // A temp folder left behind is not worth failing a scenario over.
      }
    }
  }
}
