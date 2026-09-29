package com.forma.e2e.steps;

import static org.assertj.core.api.Assertions.assertThat;

import com.forma.e2e.pages.WebhooksPage;
import com.forma.e2e.support.Actor;
import com.forma.e2e.support.World;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;

public class WebhookSteps {

  private final World world;

  public WebhookSteps(World world) {
    this.world = world;
  }

  @When("they add the webhook {string} to the form")
  public void theyAddAWebhook(String url) {
    new WebhooksPage(world).open(world.formId).add(url);
  }

  @Then("the webhook {string} is listed")
  public void theWebhookIsListed(String url) {
    new WebhooksPage(world).waitForWebhook(url);
  }

  @Then("the webhooks page says {string}")
  public void theWebhooksPageSays(String text) {
    assertThat(new WebhooksPage(world).status()).contains(text);
  }

  @Given("the form has a webhook with {int} failed deliveries")
  public void theFormHasFailedDeliveries(int count) {
    Actor owner = world.actor("owner");
    String url = "https://example.com/forma-e2e-unreachable";
    String webhookId = world.api.createWebhook(owner, world.formId, url);
    world.db.addFailedDeliveries(owner.orgId(), world.formId, webhookId, url, count);
  }

  @Then("{int} failed delivery/deliveries is/are listed")
  public void failedDeliveriesAreListed(int count) {
    new WebhooksPage(world).waitForFailedDeliveries(count);
  }

  @When("they retry a failed delivery")
  public void theyRetryAFailedDelivery() {
    new WebhooksPage(world).retryFirstFailure();
  }
}
