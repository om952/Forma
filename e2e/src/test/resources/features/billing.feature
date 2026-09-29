@billing @rbac
Feature: Plans and billing
  Owners and admins choose the plan. Members see it but cannot change it.

  Scenario: An owner on the Free plan is offered Premium
    Given an organization owner is signed in
    When they open the billing page
    Then the plan shown is "Upgrade to Premium"
    And they can start a subscription

  Scenario: Members cannot change the plan
    Given a member of an organization is signed in
    When they open the billing page
    Then they are told only owners and admins can change the plan

  Scenario: A Premium organization sees its plan
    Given a Premium organization owner is signed in
    When they open the billing page
    Then the plan shown is "Premium Plan"
