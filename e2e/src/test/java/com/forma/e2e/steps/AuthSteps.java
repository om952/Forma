package com.forma.e2e.steps;

import static org.assertj.core.api.Assertions.assertThat;

import com.forma.e2e.pages.AppHeader;
import com.forma.e2e.pages.AuthPage;
import com.forma.e2e.pages.BuilderPage;
import com.forma.e2e.pages.DashboardPage;
import com.forma.e2e.support.Api;
import com.forma.e2e.support.World;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.openqa.selenium.support.ui.WebDriverWait;

public class AuthSteps {

  private final World world;

  public AuthSteps(World world) {
    this.world = world;
  }

  @When("a visitor signs up with a new email and organization")
  public void aVisitorSignsUp() {
    String suffix = Api.unique();
    new AuthPage(world).open().signUp("visitor-" + suffix + "@e2e.test", Api.PASSWORD, "Visitor Org " + suffix);
  }

  @When("a visitor signs up with the same organization name")
  public void aVisitorSignsUpWithTakenName() {
    new AuthPage(world)
        .open()
        .signUp("visitor-" + Api.unique() + "@e2e.test", Api.PASSWORD, world.actor("owner").orgName());
  }

  @When("they sign in with their email and password")
  public void theySignIn() {
    new AuthPage(world).open().logIn(world.actor("owner").email(), world.actor("owner").password());
  }

  @When("they sign in with the password {string}")
  public void theySignInWithPassword(String password) {
    new AuthPage(world).open().logIn(world.actor("owner").email(), password);
  }

  @When("they sign out")
  public void theySignOut() {
    new AppHeader(world).signOut();
  }

  @When("a visitor opens the dashboard without signing in")
  public void aVisitorOpensTheDashboard() {
    new DashboardPage(world).open();
  }

  @Then("they land in the form builder")
  public void theyLandInTheBuilder() {
    new BuilderPage(world).waitUntilShown();
  }

  @Then("they are reminded to confirm their email address")
  public void theyAreRemindedToConfirm() {
    new WebDriverWait(world.driver(), world.config.timeout())
        .until(d -> new AppHeader(world).remindsToConfirmEmail());
  }

  @Then("the sign-in page says {string}")
  public void theSignInPageSays(String message) {
    assertThat(new AuthPage(world).message()).contains(message);
  }

  @Then("they are still on the sign-in page")
  public void theyAreStillOnTheSignInPage() {
    assertThat(new AuthPage(world).isShown()).isTrue();
  }

  @Then("the dashboard asks them to sign in")
  public void theDashboardAsksThemToSignIn() {
    assertThat(new DashboardPage(world).open().asksToSignIn()).isTrue();
  }
}
