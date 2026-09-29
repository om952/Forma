@analytics
Feature: Form analytics
  Premium organizations see how many people open, start and finish a form,
  where they give up, and when responses arrive.

  Scenario: The Free plan is invited to upgrade
    Given an organization owner is signed in
    And they have a form called "Free form"
    When they open the analytics for the form
    Then they are invited to upgrade to Premium

  @smoke
  Scenario: The funnel and drop-off count a respondent who gave up
    Given a Premium organization owner is signed in
    And they have a form called "Long survey"
    And one respondent answered "Your name" and then left the form
    And another respondent completed the form
    When they open the analytics for the form
    Then the analytics show 2 views, 2 started and 1 completed
    And "Your name" is where most people leave, at 50%

  Scenario: Submissions show up in the heatmap
    Given a Premium organization owner is signed in
    And they have a form called "Busy form"
    And 3 respondents have submitted the form
    When they open the analytics for the form
    Then the analytics show 3 responses
    And the heatmap counts 3 responses
