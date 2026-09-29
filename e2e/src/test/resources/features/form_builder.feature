@forms
Feature: Building forms
  Owners and members build forms from questions of different kinds, and can
  show a question only when an earlier answer calls for it.

  @smoke
  Scenario: Building and saving a form with several kinds of questions
    Given an organization owner is signed in
    When they build a form called "Event feedback" with these questions:
      | type   | label     | required | options   |
      | text   | Your name | yes      |           |
      | email  | Email     | no       |           |
      | select | Rating    | yes      | Good, Bad |
    And they save the form
    Then the builder says "Form saved successfully."
    And "Event feedback" is listed on the dashboard

  Scenario: A follow-up question appears only for one answer
    Given an organization owner is signed in
    When they build a form called "Support survey" with these questions:
      | type     | label            | required | options |
      | select   | Was it resolved? | yes      | Yes, No |
      | textarea | What went wrong? | no       |         |
    And they add a rule: show "What went wrong?" when "Was it resolved?" equals "No"
    And they save the form
    And a respondent opens the form
    Then the question "What went wrong?" is not asked
    When they answer "Was it resolved?" with "No"
    Then the question "What went wrong?" is asked

  Scenario: The Free plan stops at three forms
    Given an organization owner is signed in
    And their organization already has 3 forms
    When they build a form called "One too many" with these questions:
      | type | label | required | options |
      | text | Name  | no       |         |
    And they save the form
    Then the builder says "Free tier allows up to 3 forms. Upgrade to create more."

  Scenario: A disabled form stops accepting responses
    Given an organization owner is signed in
    And they have a form called "Closed survey"
    When they disable "Closed survey" on the dashboard
    And a respondent opens the form
    Then the respondent is told "This form is not accepting submissions"

  Scenario: Deleting a form removes it from the dashboard
    Given an organization owner is signed in
    And they have a form called "Old form"
    When they delete "Old form" from the dashboard
    Then "Old form" is not listed on the dashboard
