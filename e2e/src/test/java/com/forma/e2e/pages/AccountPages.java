package com.forma.e2e.pages;

import com.forma.e2e.support.World;

/**
 * The account page and the signed-out pages behind emailed links: forgot
 * password, reset password and email confirmation.
 */
public class AccountPages extends BasePage {

  public AccountPages(World world) {
    super(world);
  }

  public AccountPages openAccount() {
    visit("/account");
    visible(heading("Change password"));
    return this;
  }

  public void changePassword(String current, String next) {
    type(labelled("Current password"), current);
    type(labelled("New password"), next);
    type(labelled("Confirm new password"), next);
    click(button("Change password"));
  }

  public void signOutEverywhere() {
    click(button("Sign out of all devices"));
    acceptConfirmation();
    waitForPath("/auth");
  }

  public void requestPasswordReset(String email) {
    type(labelled("Email"), email);
    click(button("Send reset link"));
  }

  /** Opens an emailed link: the token rides in the fragment, as in the email. */
  public void openLink(String path, String token) {
    visit(path + "#" + token);
  }

  public void chooseNewPassword(String password) {
    type(labelled("New password"), password);
    type(labelled("Confirm new password"), password);
    click(button("Set new password"));
  }

  public void waitForHeading(String text) {
    visible(heading(text));
  }
}
