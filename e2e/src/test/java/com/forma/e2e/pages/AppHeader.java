package com.forma.e2e.pages;

import com.forma.e2e.support.World;
import org.openqa.selenium.By;

/** The bar across the top of every signed-in page. */
public class AppHeader extends BasePage {

  public AppHeader(World world) {
    super(world);
  }

  public void signOut() {
    click(By.xpath("//header//button[normalize-space(.)='Sign out']"));
  }

  public boolean remindsToConfirmEmail() {
    return present(testId("verify-banner"));
  }

  /** The banner goes once the page has re-read the account; give it that long. */
  public void waitUntilNoEmailReminder() {
    wait.until(d -> !remindsToConfirmEmail());
  }

  public String signedInEmail() {
    return text(By.xpath("//header//a[@href='/account']"));
  }
}
