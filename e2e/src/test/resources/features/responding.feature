@responses
Feature: Responding to a form
  Anyone with the link can fill in a form. Owners see every response and can
  download them as a spreadsheet.

  Background:
    Given an organization owner is signed in
    And they have a form called "Workshop sign-up" that thanks respondents with "See you there!"

  @smoke
  Scenario: A respondent submits the form and is thanked
    When a respondent opens the form
    And they answer "Your name" with "Ada Lovelace"
    And they answer "Email" with "ada@example.com"
    And they submit the form
    Then they are thanked with "See you there!"

  Scenario: A required question must be answered
    When a respondent opens the form
    And they answer "Email" with "ada@example.com"
    And they submit the form
    Then the form is not sent because "Your name" is required

  Scenario: A response shows up for the form's owner
    Given a respondent has answered "Your name" with "Grace Hopper"
    When the owner opens the responses to the form
    Then they see a response containing "Grace Hopper"

  Scenario: Responses can be downloaded as a spreadsheet
    Given a respondent has answered "Your name" with "Katherine Johnson"
    When the owner downloads the responses as CSV
    Then the file has a row containing "Katherine Johnson"

  Scenario: A respondent can attach a file
    Given the form also asks for a file called "CV"
    When a respondent opens the form
    And they answer "Your name" with "Alan Turing"
    And they attach an image to "CV"
    And they submit the form
    Then they are thanked with "See you there!"
    And the owner sees a link to the uploaded file among the responses
