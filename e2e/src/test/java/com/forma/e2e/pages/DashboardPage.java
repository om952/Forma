package com.forma.e2e.pages;

import com.forma.e2e.support.World;
import java.util.List;
import org.openqa.selenium.By;

/** The list of an organization's forms. */
public class DashboardPage extends BasePage {

  public DashboardPage(World world) {
    super(world);
  }

  /** Opens the dashboard and waits for it to finish loading, whatever it shows. */
  public DashboardPage open() {
    visit("/dashboard");
    wait.until(
        d -> present(testId("form-card")) || shows("No forms yet") || shows("Please sign in to view your forms"));
    return this;
  }

  public List<String> formTitles() {
    return texts("[data-testid='form-card-title']");
  }

  private By card(String title) {
    return By.xpath(
        "//*[@data-testid='form-card'][.//*[@data-testid='form-card-title'][normalize-space(.)=" + literal(title) + "]]");
  }

  public void disable(String title) {
    visible(card(title)).findElement(testId("form-toggle")).click();
    wait.until(d -> visible(card(title)).findElement(testId("form-toggle")).getText().trim().equals("Enable"));
  }

  public void delete(String title) {
    visible(card(title)).findElement(testId("form-delete")).click();
    acceptConfirmation();
    wait.until(d -> !formTitles().contains(title));
  }

  public boolean canDelete(String title) {
    return !visible(card(title)).findElements(testId("form-delete")).isEmpty();
  }

  public boolean asksToSignIn() {
    return shows("Please sign in to view your forms");
  }
}
