@auth
Feature: Signing up and signing in
  A team creates a workspace with an email, a password and an organization
  name, and comes back to it by signing in.

  @smoke
  Scenario: Signing up creates a workspace and opens the form builder
    When a visitor signs up with a new email and organization
    Then they land in the form builder
    And they are reminded to confirm their email address

  @smoke
  Scenario: Signing in with the right password
    Given an organization owner who has signed out
    When they sign in with their email and password
    Then they land on their dashboard

  Scenario: A wrong password is refused
    Given an organization owner who has signed out
    When they sign in with the password "not-the-password"
    Then the sign-in page says "Invalid credentials"
    And they are still on the sign-in page

  Scenario: An organization name that is already taken is refused
    Given an organization owner who has signed out
    When a visitor signs up with the same organization name
    Then the sign-in page says "Organization already exists"

  Scenario: Signing out returns to the sign-in page
    Given an organization owner is signed in
    When they sign out
    Then they are on the sign-in page
    And the dashboard asks them to sign in

  Scenario: The dashboard asks visitors without an account to sign in
    When a visitor opens the dashboard without signing in
    Then the dashboard asks them to sign in
