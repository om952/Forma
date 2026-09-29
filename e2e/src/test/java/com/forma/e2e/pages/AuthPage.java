package com.forma.e2e.pages;

import com.forma.e2e.support.World;
import org.openqa.selenium.By;

/** The sign-up / sign-in page. */
public class AuthPage extends BasePage {

  public AuthPage(World world) {
    super(world);
  }

  public AuthPage open() {
    visit("/auth");
    visible(testId("auth-submit"));
    return this;
  }

  public void signUp(String email, String password, String organization) {
    click(testId("auth-tab-signup"));
    type(testId("auth-email"), email);
    type(testId("auth-password"), password);
    type(testId("auth-org"), organization);
    click(testId("auth-submit"));
  }

  public void logIn(String email, String password) {
    click(testId("auth-tab-login"));
    type(testId("auth-email"), email);
    type(testId("auth-password"), password);
    click(testId("auth-submit"));
  }

  public String message() {
    return text(testId("auth-status"));
  }

  public void forgotPassword() {
    click(testId("auth-tab-login"));
    click(By.linkText("Forgot password?"));
    waitForPath("/forgot-password");
  }

  public boolean isShown() {
    return currentPath().startsWith("/auth") && present(testId("auth-submit"));
  }
}
