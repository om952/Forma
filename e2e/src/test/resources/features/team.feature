@team @rbac
Feature: Team members and roles
  Owners invite people as admins or members. Owners change roles, admins can
  invite and remove members, and members use forms without managing the team.

  @smoke
  Scenario: An owner invites an admin, who joins through the invite link
    Given an organization owner is signed in
    When they invite a new teammate as "Admin"
    Then they get an invite link to share
    When the owner signs out
    And the teammate opens the invite link and joins as "Sam Admin"
    Then the teammate is signed in to the owner's organization
    And the team lists "Sam Admin" as "Admin"

  Scenario: An admin can invite members but not other admins
    Given an admin of an organization is signed in
    When they open the team page
    Then the only role they can invite is "Member"

  Scenario: A member can see the team but not manage it
    Given a member of an organization is signed in
    When they open the team page
    Then they see the organization's members
    But they cannot invite or remove anyone
    And they cannot see the team's activity

  Scenario: A member cannot delete forms
    Given a member of an organization is signed in
    And the organization has a form called "Team form"
    When they open the dashboard
    Then "Team form" has no delete button

  Scenario: The last owner cannot step down
    Given an organization owner is signed in
    When they change their own role to "Admin"
    Then the team page says "An organization needs at least one owner. Make someone else an owner first."

  Scenario: A removed member is signed out
    Given an organization owner is signed in
    And their organization has a member
    When the owner removes the member
    Then the member is no longer listed
    And the member's session no longer works

  Scenario: Role changes and removals are recorded in the team's activity
    Given an organization owner is signed in
    And their organization has a member
    When the owner makes the member an admin
    And the owner removes the member
    Then the team's activity shows "Removed" first, then "from member to admin"
