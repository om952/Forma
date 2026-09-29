package com.forma.e2e.support;

import io.cucumber.java.After;
import io.cucumber.java.Scenario;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.openqa.selenium.By;
import org.openqa.selenium.OutputType;
import org.openqa.selenium.TakesScreenshot;

public class Hooks {

  private final World world;

  public Hooks(World world) {
    this.world = world;
  }

  /**
   * A failed scenario leaves its evidence: a screenshot and the page's URL and
   * text in the report, and the screenshot in target/failures for CI to keep.
   * Every scenario closes its browser.
   */
  @After
  public void tearDown(Scenario scenario) {
    try {
      if (scenario.isFailed() && world.hasBrowser()) {
        byte[] screenshot = ((TakesScreenshot) world.driver()).getScreenshotAs(OutputType.BYTES);
        scenario.attach(screenshot, "image/png", "page when it failed");
        scenario.log("URL: " + world.driver().getCurrentUrl());
        String text = world.driver().findElement(By.tagName("body")).getText();
        scenario.log("Page text:\n" + (text.length() > 3000 ? text.substring(0, 3000) + "…" : text));
        save(scenario, screenshot);
      }
    } catch (RuntimeException e) {
      scenario.log("Could not capture the failure: " + e.getMessage());
    } finally {
      world.close();
    }
  }

  private static void save(Scenario scenario, byte[] screenshot) {
    try {
      Path folder = Files.createDirectories(Path.of("target", "failures"));
      String name = scenario.getName().replaceAll("[^A-Za-z0-9]+", "-").toLowerCase();
      Files.write(folder.resolve(name + ".png"), screenshot);
    } catch (IOException ignored) {
      // The report still has the screenshot.
    }
  }
}
