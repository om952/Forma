package com.forma.e2e.pages;

import com.forma.e2e.support.World;

/** Plans and subscription. */
public class BillingPage extends BasePage {

  public BillingPage(World world) {
    super(world);
  }

  public BillingPage open() {
    visit("/billing");
    visible(testId("billing-plan"));
    return this;
  }

  public String plan() {
    return text(testId("billing-plan"));
  }

  public boolean canSubscribe() {
    return present(testId("billing-subscribe"));
  }

  public boolean saysOnlyManagersCanChangePlan() {
    return present(testId("billing-managers-only"));
  }
}
