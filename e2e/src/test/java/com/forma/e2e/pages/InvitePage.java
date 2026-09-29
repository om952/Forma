package com.forma.e2e.pages;

import com.forma.e2e.support.World;
import org.openqa.selenium.By;

/** Where an invitee sets a password and joins. */
public class InvitePage extends BasePage {

  public InvitePage(World world) {
    super(world);
  }

  /** Opens the link exactly as it was shared, fragment and all. */
  public InvitePage open(String link) {
    driver.get(link);
    waitForApp();
    wait.until(d -> shows("Join ") || shows("Can't use this invitation"));
    return this;
  }

  public String heading() {
    return text(By.tagName("h1"));
  }

  public void join(String name, String password) {
    type(labelled("Your name"), name);
    type(labelled("Password"), password);
    type(labelled("Confirm password"), password);
    click(By.xpath("//button[starts-with(normalize-space(.), 'Join ')]"));
    waitForPath("/dashboard");
  }
}
