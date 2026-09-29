@webhooks
Feature: Webhooks
  Responses can be sent on to other systems. Deliveries that keep failing are
  kept so they can be retried.

  Background:
    Given an organization owner is signed in
    And they have a form called "Leads"

  Scenario: An owner connects a webhook
    When they add the webhook "https://example.com/forma-hook" to the form
    Then the webhook "https://example.com/forma-hook" is listed

  Scenario: A webhook to an internal address is refused
    When they add the webhook "http://127.0.0.1:6379/" to the form
    Then the webhooks page says "non-public address"

  Scenario: A delivery that kept failing can be retried
    Given the form has a webhook with 2 failed deliveries
    When they open the webhooks for the form
    Then 2 failed deliveries are listed
    When they retry a failed delivery
    Then 1 failed delivery is listed
