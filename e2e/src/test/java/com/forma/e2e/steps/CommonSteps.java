package com.forma.e2e.steps;

import static org.assertj.core.api.Assertions.assertThat;

import com.forma.e2e.pages.AnalyticsPage;
import com.forma.e2e.pages.AuthPage;
import com.forma.e2e.pages.BillingPage;
import com.forma.e2e.pages.DashboardPage;
import com.forma.e2e.pages.TeamPage;
import com.forma.e2e.pages.WebhooksPage;
import com.forma.e2e.support.Actor;
import com.forma.e2e.support.Api;
import com.forma.e2e.support.World;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.openqa.selenium.support.ui.WebDriverWait;

/** Who is in the scenario, what already exists, and moving between pages. */
public class CommonSteps {

  private final World world;

  public CommonSteps(World world) {
    this.world = world;
  }

  /** Signs {@code actor} in and leaves them on the dashboard, as after signing in. */
  private void signIn(String role, Actor actor) {
    world.remember(role, actor);
    world.remember("current", actor);
    world.signInAs(actor);
    new DashboardPage(world).open();
  }

  @Given("an organization owner is signed in")
  public void anOwnerIsSignedIn() {
    signIn("owner", world.api.signUp("Olivia Owner"));
  }

  @Given("a Premium organization owner is signed in")
  public void aPremiumOwnerIsSignedIn() {
    Actor owner = world.api.signUp("Olivia Owner");
    world.db.makePremium(owner.orgId());
    signIn("owner", owner);
  }

  @Given("an organization owner who has signed out")
  public void anOwnerWhoHasSignedOut() {
    Actor owner = world.api.signUp("Olivia Owner");
    world.remember("owner", owner);
    world.remember("current", owner);
  }

  @Given("an admin of an organization is signed in")
  public void anAdminIsSignedIn() {
    Actor owner = world.api.signUp("Olivia Owner");
    world.remember("owner", owner);
    signIn("admin", world.api.addMember(owner, "ADMIN", "Alex Admin"));
  }

  @Given("a member of an organization is signed in")
  public void aMemberIsSignedIn() {
    Actor owner = world.api.signUp("Olivia Owner");
    world.remember("owner", owner);
    signIn("member", world.api.addMember(owner, "MEMBER", "Morgan Member"));
  }

  @Given("their organization has a member")
  public void theirOrganizationHasAMember() {
    world.remember("member", world.api.addMember(world.actor("owner"), "MEMBER", "Morgan Member"));
  }

  @Given("they have a form called {string}")
  public void theyHaveAForm(String title) {
    world.formTitle = title;
    world.formId = world.api.createForm(world.actor("current"), title, Api.defaultQuestions(), null);
  }

  @Given("they have a form called {string} that thanks respondents with {string}")
  public void theyHaveAFormThatThanks(String title, String thankYou) {
    world.formTitle = title;
    world.formId = world.api.createForm(world.actor("current"), title, Api.defaultQuestions(), thankYou);
  }

  @Given("the organization has a form called {string}")
  public void theOrganizationHasAForm(String title) {
    world.formTitle = title;
    world.formId = world.api.createForm(world.actor("owner"), title, Api.defaultQuestions(), null);
  }

  @Given("their organization already has {int} forms")
  public void alreadyHasForms(int count) {
    for (int i = 1; i <= count; i++) {
      world.api.createForm(world.actor("current"), "Existing form " + i, Api.defaultQuestions(), null);
    }
  }

  @When("they open the dashboard")
  public void theyOpenTheDashboard() {
    new DashboardPage(world).open();
  }

  @When("they open the team page")
  public void theyOpenTheTeamPage() {
    new TeamPage(world).open();
  }

  @When("they open the billing page")
  public void theyOpenTheBillingPage() {
    new BillingPage(world).open();
  }

  @When("they open the analytics for the form")
  public void theyOpenTheAnalytics() {
    new AnalyticsPage(world).open(world.formId);
  }

  @When("they open the webhooks for the form")
  public void theyOpenTheWebhooks() {
    new WebhooksPage(world).open(world.formId);
  }

  @Then("they are on the sign-in page")
  public void theyAreOnTheSignInPage() {
    new WebDriverWait(world.driver(), world.config.timeout())
        .until(d -> new AuthPage(world).isShown());
    assertThat(new AuthPage(world).isShown()).isTrue();
  }
}
