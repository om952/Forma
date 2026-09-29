package com.forma.e2e.pages;

import com.forma.e2e.support.World;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.openqa.selenium.By;
import org.openqa.selenium.WebElement;

/** The responses a form has received. */
public class ResponsesPage extends BasePage {

  public ResponsesPage(World world) {
    super(world);
  }

  public ResponsesPage open(String formId) {
    visit("/responses/" + formId);
    wait.until(d -> present(testId("response-card")) || shows("No submissions yet"));
    return this;
  }

  public List<String> responses() {
    return texts("[data-testid='response-card']");
  }

  public List<String> fileLinks() {
    return all(By.xpath("//*[@data-testid='response-card']//*[contains(text(), '/api/files/')]"))
        .stream()
        .map(WebElement::getText)
        .toList();
  }

  /** Clicks export and waits for the finished CSV in the browser's download folder. */
  public Path exportCsv() {
    click(testId("responses-export"));
    Path folder = world.downloads();
    wait.until(
        d -> {
          try (var files = Files.list(folder)) {
            return files.anyMatch(f -> f.toString().endsWith(".csv"));
          } catch (IOException e) {
            return false;
          }
        });
    try (var files = Files.list(folder)) {
      return files.filter(f -> f.toString().endsWith(".csv")).findFirst().orElseThrow();
    } catch (IOException e) {
      throw new IllegalStateException(e);
    }
  }
}
