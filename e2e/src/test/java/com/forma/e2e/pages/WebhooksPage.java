package com.forma.e2e.pages;

import com.forma.e2e.support.World;
import java.util.List;

/** A form's webhooks and the deliveries that failed. */
public class WebhooksPage extends BasePage {

  public WebhooksPage(World world) {
    super(world);
  }

  public WebhooksPage open(String formId) {
    visit("/webhooks/" + formId);
    visible(testId("webhook-url"));
    return this;
  }

  public void add(String url) {
    type(testId("webhook-url"), url);
    click(testId("webhook-add"));
  }

  public List<String> webhooks() {
    return texts("[data-testid='webhook-row']");
  }

  public void waitForWebhook(String url) {
    wait.until(d -> webhooks().stream().anyMatch(row -> row.contains(url)));
  }

  public String status() {
    return text(testId("webhooks-status"));
  }

  public int failedDeliveries() {
    return all(testId("dead-letter-row")).size();
  }

  public void waitForFailedDeliveries(int count) {
    wait.until(d -> failedDeliveries() == count);
  }

  public void retryFirstFailure() {
    all(testId("dead-letter-row")).get(0).findElement(org.openqa.selenium.By.xpath(".//button[normalize-space(.)='Retry']")).click();
  }
}
