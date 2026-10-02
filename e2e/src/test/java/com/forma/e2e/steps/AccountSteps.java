package com.forma.e2e.steps;

import static org.assertj.core.api.Assertions.assertThat;

import com.forma.e2e.pages.AccountPages;
import com.forma.e2e.pages.AppHeader;
import com.forma.e2e.pages.AuthPage;
import com.forma.e2e.pages.DashboardPage;
import com.forma.e2e.support.Actor;
import com.forma.e2e.support.World;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.openqa.selenium.JavascriptExecutor;

public class AccountSteps {

  private final World world;

  public AccountSteps(World world) {
    this.world = world;
  }

  @When("they ask to reset their password")
  public void theyAskToResetTheirPassword() {
    new AuthPage(world).open().forgotPassword();
    new AccountPages(world).requestPasswordReset(world.actor("owner").email());
  }

  @Then("they are told to check their email")
  public void theyAreToldToCheckTheirEmail() {
    new AccountPages(world).waitForHeading("Check your email");
  }

  /** Email is off on the test stack, so the link is made the way the app makes it. */
  @When("they open their password reset link and choose the password {string}")
  public void theyResetTheirPassword(String password) {
    Actor owner = world.actor("owner");
    String token = world.db.issueLinkToken(owner.userId(), "PASSWORD_RESET");
    AccountPages pages = new AccountPages(world);
    pages.openLink("/reset-password", token);
    pages.chooseNewPassword(password);
  }

  @Then("they are told their password was updated")
  public void theyAreToldTheirPasswordWasUpdated() {
    new AccountPages(world).waitForHeading("Password updated");
  }

  @Then("they can sign in with the password {string}")
  public void theyCanSignInWith(String password) {
    new AuthPage(world).open().logIn(world.actor("owner").email(), password);
    new DashboardPage(world).waitUntilShown();
  }

  @When("they open their email confirmation link")
  public void theyOpenTheirConfirmationLink() {
    String token = world.db.issueLinkToken(world.actor("owner").userId(), "EMAIL_VERIFICATION");
    new AccountPages(world).openLink("/verify-email", token);
  }

  @Then("they are told their email is confirmed")
  public void theyAreToldTheirEmailIsConfirmed() {
    new AccountPages(world).waitForHeading("Email confirmed");
  }

  @Then("they are no longer reminded to confirm their email")
  public void theyAreNoLongerReminded() {
    new DashboardPage(world).open();
    new AppHeader(world).waitUntilNoEmailReminder();
  }

  @When("they change their password to {string}")
  public void theyChangeTheirPassword(String password) {
    new AccountPages(world).openAccount().changePassword(world.actor("owner").password(), password);
  }

  @Then("the account page says {string}")
  public void theAccountPageSays(String message) {
    new AccountPages(world).waitForText(message);
  }

  @Then("they are still signed in")
  public void theyAreStillSignedIn() {
    String current = (String) ((JavascriptExecutor) world.driver()).executeScript("return localStorage.getItem('forma_token');");
    assertThat(current).isNotEqualTo(world.actor("owner").token());
    assertThat(world.api.status("GET", "/api/auth/me", current)).isEqualTo(200);
    assertThat(new DashboardPage(world).open().asksToSignIn()).isFalse();
  }

  @Then("their previous session no longer works")
  public void theirPreviousSessionNoLongerWorks() {
    assertThat(world.api.status("GET", "/api/auth/me", world.actor("owner").token())).isEqualTo(401);
  }

  @When("they sign out of all devices")
  public void theySignOutOfAllDevices() {
    new AccountPages(world).openAccount().signOutEverywhere();
  }
}
