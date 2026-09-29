package com.forma.e2e.steps;

import static org.assertj.core.api.Assertions.assertThat;

import com.forma.e2e.pages.BillingPage;
import com.forma.e2e.support.World;
import io.cucumber.java.en.Then;

public class BillingSteps {

  private final World world;

  public BillingSteps(World world) {
    this.world = world;
  }

  @Then("the plan shown is {string}")
  public void thePlanShownIs(String plan) {
    assertThat(new BillingPage(world).plan()).isEqualTo(plan);
  }

  @Then("they can start a subscription")
  public void theyCanStartASubscription() {
    assertThat(new BillingPage(world).canSubscribe()).isTrue();
  }

  @Then("they are told only owners and admins can change the plan")
  public void theyAreToldOnlyManagersCanChangeThePlan() {
    BillingPage billing = new BillingPage(world);
    assertThat(billing.saysOnlyManagersCanChangePlan()).isTrue();
    assertThat(billing.canSubscribe()).isFalse();
  }
}
