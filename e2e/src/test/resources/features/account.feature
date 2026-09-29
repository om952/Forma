@account
Feature: Account security
  People can reset a forgotten password, confirm their email address, change
  their password and sign out everywhere.

  Scenario: Resetting a forgotten password
    Given an organization owner who has signed out
    When they ask to reset their password
    Then they are told to check their email
    When they open their password reset link and choose the password "brand-new-pass-1"
    Then they are told their password was updated
    And they can sign in with the password "brand-new-pass-1"

  Scenario: Confirming an email address
    Given an organization owner is signed in
    When they open their email confirmation link
    Then they are told their email is confirmed
    And they are no longer reminded to confirm their email

  Scenario: Changing the password keeps you signed in here only
    Given an organization owner is signed in
    When they change their password to "changed-pass-1"
    Then the account page says "Password changed. Other sessions have been signed out."
    And they are still signed in
    And their previous session no longer works

  Scenario: Signing out of all devices
    Given an organization owner is signed in
    When they sign out of all devices
    Then they are on the sign-in page
    And their previous session no longer works
