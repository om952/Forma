package com.forma.e2e.pages;

import com.forma.e2e.support.World;
import java.util.List;
import org.openqa.selenium.By;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.Select;

/** Members, roles and invitations. */
public class TeamPage extends BasePage {

  public TeamPage(World world) {
    super(world);
  }

  public TeamPage open() {
    visit("/team");
    visible(testId("member-row"));
    return this;
  }

  public List<String> members() {
    return texts("[data-testid='member-row']");
  }

  private WebElement member(String nameOrEmail) {
    return visible(
        By.xpath("//*[@data-testid='member-row'][contains(normalize-space(.), " + literal(nameOrEmail) + ")]"));
  }

  public boolean canInvite() {
    return present(testId("invite-email"));
  }

  public boolean canRemoveAnyone() {
    return present(testId("member-remove"));
  }

  public List<String> invitableRoles() {
    return new Select(visible(testId("invite-role")))
        .getOptions().stream().map(WebElement::getText).map(String::trim).toList();
  }

  /** Invites {@code email} at {@code role} ("Admin" or "Member") and returns the link to share. */
  public String invite(String email, String role) {
    type(testId("invite-email"), email);
    choose(testId("invite-role"), role);
    click(testId("invite-submit"));
    return visible(By.cssSelector("[data-testid='invite-link'] input")).getAttribute("value");
  }

  /** The role a member holds, whether shown as a badge or as the owner's role picker. */
  public String roleOf(String nameOrEmail) {
    WebElement row = member(nameOrEmail);
    List<WebElement> picker = row.findElements(By.tagName("select"));
    return picker.isEmpty()
        ? row.findElement(By.xpath(".//span[contains(@class, 'rounded-full')]")).getText().trim()
        : new Select(picker.get(0)).getFirstSelectedOption().getText().trim();
  }

  public void changeRole(String email, String role) {
    choose(By.cssSelector("select[aria-label='Role for " + email + "']"), role);
  }

  public void remove(String nameOrEmail) {
    member(nameOrEmail).findElement(testId("member-remove")).click();
    acceptConfirmation();
    wait.until(d -> members().stream().noneMatch(row -> row.contains(nameOrEmail)));
  }

  public String notice() {
    return text(testId("team-notice"));
  }

  public String error() {
    return text(testId("team-error"));
  }
}
