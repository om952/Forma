package com.forma.e2e.pages;

import com.forma.e2e.support.World;
import java.util.List;
import org.openqa.selenium.By;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.Keys;
import org.openqa.selenium.Platform;
import org.openqa.selenium.StaleElementReferenceException;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.Select;
import org.openqa.selenium.support.ui.WebDriverWait;

/**
 * What every page object shares: waiting for the page to be ready, and finding
 * things the way a person would, by the text they read. Elements a person has
 * no text for are found by their {@code data-testid}.
 */
public abstract class BasePage {

  protected final World world;
  protected final WebDriver driver;
  protected final WebDriverWait wait;

  protected BasePage(World world) {
    this.world = world;
    this.driver = world.driver();
    // React replaces elements as it re-renders; a wait simply looks again.
    this.wait = new WebDriverWait(driver, world.config.timeout());
    this.wait.ignoring(StaleElementReferenceException.class);
  }

  // ---- Locators -------------------------------------------------------------

  protected static By testId(String id) {
    return By.cssSelector("[data-testid='" + id + "']");
  }

  /** A button whose visible text is exactly {@code label}. */
  protected static By button(String label) {
    return By.xpath("//button[normalize-space(.)=" + literal(label) + "]");
  }

  /** The input, select or textarea inside the label that starts with {@code label}. */
  protected static By labelled(String label) {
    return By.xpath(
        "//label[starts-with(normalize-space(.), " + literal(label) + ")]//*[self::input or self::select or self::textarea]");
  }

  protected static By heading(String text) {
    return By.xpath("//*[self::h1 or self::h2 or self::h3][normalize-space(.)=" + literal(text) + "]");
  }

  /** An XPath string literal for any text, including text with quotes. */
  protected static String literal(String text) {
    if (!text.contains("'")) return "'" + text + "'";
    if (!text.contains("\"")) return "\"" + text + "\"";
    return "concat('" + text.replace("'", "',\"'\",'") + "')";
  }

  // ---- Navigation -----------------------------------------------------------

  /**
   * Opens a path and waits for React to take over the server-rendered page.
   * Until it has, buttons look ready but do nothing.
   */
  protected void visit(String path) {
    driver.get(world.config.baseUrl() + path);
    waitForApp();
  }

  protected void waitForApp() {
    wait.until(
        d ->
            (Boolean)
                ((JavascriptExecutor) d)
                    .executeScript(
                        "return document.readyState === 'complete' && Array.from(document.body.children)"
                            + ".some(el => Object.keys(el).some(k => k.startsWith('__reactFiber')));"));
  }

  public String currentPath() {
    String url = driver.getCurrentUrl();
    String withoutOrigin = url.substring(world.config.baseUrl().length());
    int hash = withoutOrigin.indexOf('#');
    return hash >= 0 ? withoutOrigin.substring(0, hash) : withoutOrigin;
  }

  protected void waitForPath(String path) {
    wait.until(d -> currentPath().equals(path) || currentPath().startsWith(path + "?"));
    waitForApp();
  }

  // ---- Interaction ----------------------------------------------------------

  protected WebElement visible(By by) {
    return wait.until(ExpectedConditions.visibilityOfElementLocated(by));
  }

  protected List<WebElement> all(By by) {
    return driver.findElements(by);
  }

  /**
   * The text of every element matching a CSS selector, read in one step so a
   * re-render halfway through cannot leave a stale element behind.
   */
  @SuppressWarnings("unchecked")
  protected List<String> texts(String cssSelector) {
    return (List<String>)
        ((JavascriptExecutor) driver)
            .executeScript(
                "return Array.from(document.querySelectorAll(arguments[0])).map(e => e.innerText.trim());",
                cssSelector);
  }

  protected boolean present(By by) {
    return !driver.findElements(by).isEmpty();
  }

  protected void click(By by) {
    wait.until(ExpectedConditions.elementToBeClickable(by)).click();
  }

  /** Replaces whatever the field holds, the way a person selects all and types. */
  protected void type(By by, String value) {
    WebElement field = visible(by);
    Keys modifier = Platform.getCurrent().is(Platform.MAC) ? Keys.COMMAND : Keys.CONTROL;
    field.sendKeys(Keys.chord(modifier, "a"), Keys.DELETE);
    field.sendKeys(value);
  }

  protected void choose(By select, String visibleText) {
    new Select(visible(select)).selectByVisibleText(visibleText);
  }

  protected void acceptConfirmation() {
    wait.until(ExpectedConditions.alertIsPresent()).accept();
  }

  protected String text(By by) {
    return visible(by).getText().trim();
  }

  /** Waits until {@code text} appears anywhere on the page. */
  public void waitForText(String text) {
    wait.until(d -> d.findElement(By.tagName("body")).getText().contains(text));
  }

  public boolean shows(String text) {
    return driver.findElement(By.tagName("body")).getText().contains(text);
  }
}
