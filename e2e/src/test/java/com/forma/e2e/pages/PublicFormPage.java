package com.forma.e2e.pages;

import com.forma.e2e.support.World;
import java.nio.file.Path;
import org.openqa.selenium.By;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.Select;

/** A form as a respondent sees it. */
public class PublicFormPage extends BasePage {

  public PublicFormPage(World world) {
    super(world);
  }

  public PublicFormPage open(String formId) {
    visit("/form/" + formId);
    wait.until(d -> present(testId("form-field")) || present(testId("form-status")));
    return this;
  }

  private By question(String label) {
    return By.xpath(
        "//*[@data-testid='form-field'][.//label[starts-with(normalize-space(.), " + literal(label) + ")]]");
  }

  private WebElement input(String label) {
    return visible(question(label)).findElement(By.cssSelector("input, textarea, select"));
  }

  public void answer(String label, String value) {
    WebElement input = input(label);
    if ("select".equals(input.getTagName())) {
      new Select(input).selectByVisibleText(value);
    } else {
      input.click();
      input.sendKeys(value);
    }
  }

  public void attach(String label, Path file) {
    input(label).sendKeys(file.toAbsolutePath().toString());
  }

  public boolean asks(String label) {
    return present(question(label));
  }

  public void waitUntilAsks(String label) {
    wait.until(d -> asks(label));
  }

  public void submit() {
    click(button("Submit"));
  }

  public String thankYou() {
    waitForText("Thank you!");
    return driver.findElement(By.tagName("body")).getText();
  }

  /** True while the browser refuses to submit because a required question is empty. */
  public boolean isBlockedByRequired(String label) {
    return (Boolean)
        ((JavascriptExecutor) driver).executeScript("return arguments[0].validity.valueMissing;", input(label));
  }

  public String problem() {
    return text(testId("form-status"));
  }
}
