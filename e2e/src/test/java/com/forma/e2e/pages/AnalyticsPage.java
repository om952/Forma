package com.forma.e2e.pages;

import com.forma.e2e.support.World;
import org.openqa.selenium.By;
import org.openqa.selenium.WebElement;

/** A form's analytics: KPI tiles, drop-off table, daily chart and heatmap. */
public class AnalyticsPage extends BasePage {

  public AnalyticsPage(World world) {
    super(world);
  }

  public AnalyticsPage open(String formId) {
    visit("/analytics/" + formId);
    wait.until(d -> present(testId("kpis")) || shows("Unlock analytics"));
    return this;
  }

  public boolean offersUpgrade() {
    return shows("Unlock analytics") && present(By.linkText("Upgrade to Premium"));
  }

  /** The value on the KPI tile labelled {@code label}. */
  public String kpi(String label) {
    for (WebElement tile : all(testId("kpi"))) {
      if (tile.findElement(testId("kpi-label")).getText().trim().equals(label)) {
        return tile.findElement(testId("kpi-value")).getText().trim();
      }
    }
    throw new IllegalStateException("No KPI tile labelled " + label);
  }

  /** The drop-off table's row for the question {@code label}, as one line of text. */
  public String dropOffRow(String label) {
    return visible(
            By.xpath(
                "//*[@data-testid='dropoff-row'][.//p[normalize-space(.)=" + literal(label) + "]]"))
        .getText()
        .replaceAll("\\s+", " ");
  }

  /** Opens the heatmap's table view and returns the total of its cells. */
  public int heatmapTotal() {
    WebElement section = visible(By.xpath("//section[.//h2[normalize-space(.)='When responses arrive']]"));
    section.findElement(By.xpath(".//summary[normalize-space(.)='Show as table']")).click();
    int total = 0;
    for (WebElement cell : section.findElements(By.xpath(".//table//tbody//td[position() > 1]"))) {
      total += Integer.parseInt(cell.getText().trim());
    }
    return total;
  }
}
