package com.forma.e2e.steps;

import static org.assertj.core.api.Assertions.assertThat;

import com.forma.e2e.pages.AppHeader;
import com.forma.e2e.pages.InvitePage;
import com.forma.e2e.pages.TeamPage;
import com.forma.e2e.support.Api;
import com.forma.e2e.support.World;
import io.cucumber.java.en.But;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.openqa.selenium.By;
import org.openqa.selenium.support.ui.WebDriverWait;

public class TeamSteps {

  private final World world;

  public TeamSteps(World world) {
    this.world = world;
  }

  @When("they invite a new teammate as {string}")
  public void theyInviteATeammate(String role) {
    world.inviteEmail = "teammate-" + Api.unique() + "@e2e.test";
    world.inviteLink = new TeamPage(world).open().invite(world.inviteEmail, role);
  }

  @Then("they get an invite link to share")
  public void theyGetAnInviteLink() {
    assertThat(world.inviteLink).startsWith(world.config.baseUrl() + "/invite#");
  }

  @When("the owner signs out")
  public void theOwnerSignsOut() {
    new AppHeader(world).signOut();
  }

  @When("the teammate opens the invite link and joins as {string}")
  public void theTeammateJoins(String name) {
    InvitePage invite = new InvitePage(world).open(world.inviteLink);
    assertThat(invite.heading()).isEqualTo("Join " + world.actor("owner").orgName());
    invite.join(name, Api.PASSWORD);
  }

  @Then("the teammate is signed in to the owner's organization")
  public void theTeammateIsSignedIn() {
    assertThat(new AppHeader(world).signedInEmail()).isEqualTo(world.inviteEmail);
    new TeamPage(world).open();
    assertThat(world.driver().findElement(By.tagName("h1")).getText()).isEqualTo(world.actor("owner").orgName());
  }

  @Then("the team lists {string} as {string}")
  public void theTeamLists(String name, String role) {
    assertThat(new TeamPage(world).open().roleOf(name)).isEqualTo(role);
  }

  @Then("the only role they can invite is {string}")
  public void theOnlyInvitableRole(String role) {
    assertThat(new TeamPage(world).invitableRoles()).containsExactly(role);
  }

  @Then("they see the organization's members")
  public void theySeeTheMembers() {
    assertThat(new TeamPage(world).members())
        .anyMatch(row -> row.contains(world.actor("owner").email()))
        .anyMatch(row -> row.contains("Morgan Member"));
  }

  @But("they cannot invite or remove anyone")
  public void theyCannotManageTheTeam() {
    TeamPage team = new TeamPage(world);
    assertThat(team.canInvite()).isFalse();
    assertThat(team.canRemoveAnyone()).isFalse();
  }

  @Then("they cannot see the team's activity")
  public void theyCannotSeeTheActivity() {
    assertThat(new TeamPage(world).showsActivity()).isFalse();
  }

  @When("the owner makes the member an admin")
  public void theOwnerMakesTheMemberAnAdmin() {
    TeamPage team = new TeamPage(world).open();
    team.changeRole(world.actor("member").email(), "Admin");
    team.waitForText("is now admin.");
  }

  @Then("the team's activity shows {string} first, then {string}")
  public void theActivityShows(String newest, String older) {
    TeamPage team = new TeamPage(world).open();
    team.waitForActivityCount(2);
    assertThat(team.activity().get(0)).contains(newest).contains(world.actor("member").email());
    assertThat(team.activity().get(1)).contains(older).contains(world.actor("owner").email());
  }

  @When("they change their own role to {string}")
  public void theyChangeTheirOwnRole(String role) {
    new TeamPage(world).open().changeRole(world.actor("owner").email(), role);
  }

  @Then("the team page says {string}")
  public void theTeamPageSays(String message) {
    TeamPage team = new TeamPage(world);
    new WebDriverWait(world.driver(), world.config.timeout())
        .until(d -> team.shows(message));
  }

  @When("the owner removes the member")
  public void theOwnerRemovesTheMember() {
    new TeamPage(world).open().remove("Morgan Member");
  }

  @Then("the member is no longer listed")
  public void theMemberIsNoLongerListed() {
    assertThat(new TeamPage(world).open().members()).noneMatch(row -> row.contains("Morgan Member"));
  }

  @Then("the member's session no longer works")
  public void theMembersSessionNoLongerWorks() {
    assertThat(world.api.status("GET", "/api/auth/me", world.actor("member").token())).isEqualTo(401);
  }
}
