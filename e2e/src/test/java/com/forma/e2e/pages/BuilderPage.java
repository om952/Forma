package com.forma.e2e.pages;

import com.forma.e2e.support.World;
import java.util.List;
import org.openqa.selenium.By;
import org.openqa.selenium.WebElement;

/** The form builder: questions, their settings, conditional rules and saving. */
public class BuilderPage extends BasePage {

  public BuilderPage(World world) {
    super(world);
  }

  public BuilderPage open() {
    visit("/builder");
    visible(testId("builder-title"));
    return this;
  }

  public boolean isShown() {
    return currentPath().startsWith("/builder") && present(testId("builder-title"));
  }

  public void waitUntilShown() {
    waitForPath("/builder");
    visible(testId("builder-title"));
  }

  public void setTitle(String title) {
    type(testId("builder-title"), title);
  }

  /**
   * Adds a question of {@code type} (text, textarea, email, number, date,
   * checkbox, select or file) and gives it its label, whether it is
   * required, and for a select its options.
   */
  public void addQuestion(String type, String label, boolean required, List<String> options) {
    int before = all(testId("builder-field")).size();
    click(testId("add-field-" + type));
    wait.until(d -> all(testId("builder-field")).size() == before + 1);

    WebElement added = all(testId("builder-field")).get(before);
    added.findElement(testId("builder-field-edit")).click();

    type(testId("field-label"), label);
    WebElement requiredBox = visible(testId("field-required"));
    if (requiredBox.isSelected() != required) requiredBox.click();
    if (!options.isEmpty()) type(testId("field-options"), String.join(", ", options));
    click(testId("field-save"));
    wait.until(d -> all(testId("builder-field")).get(before).getText().contains(label));
  }

  /** "show {target} when {source} {operator} {value}", as the rule editor reads. */
  public void addRule(String action, String target, String source, String operator, String value) {
    if (!present(testId("rule-add"))) click(testId("builder-rules-toggle"));
    choose(testId("rule-if"), source);
    choose(testId("rule-operator"), operator);
    type(testId("rule-value"), value);
    choose(testId("rule-action"), action);
    choose(testId("rule-target"), target);
    click(testId("rule-add"));
  }

  public void setThankYouMessage(String message) {
    type(testId("builder-thankyou"), message);
  }

  public void save() {
    click(testId("builder-save"));
    wait.until(d -> present(testId("builder-status")) && !text(testId("builder-save")).startsWith("Saving"));
  }

  public String status() {
    return text(testId("builder-status"));
  }
}
