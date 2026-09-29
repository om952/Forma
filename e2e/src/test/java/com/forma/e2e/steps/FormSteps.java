package com.forma.e2e.steps;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.forma.e2e.pages.BuilderPage;
import com.forma.e2e.pages.DashboardPage;
import com.forma.e2e.support.World;
import io.cucumber.datatable.DataTable;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

public class FormSteps {

  private final World world;

  public FormSteps(World world) {
    this.world = world;
  }

  @When("they build a form called {string} with these questions:")
  public void theyBuildAForm(String title, DataTable questions) {
    BuilderPage builder = new BuilderPage(world).open();
    builder.setTitle(title);
    for (Map<String, String> question : questions.asMaps()) {
      String options = question.getOrDefault("options", "");
      builder.addQuestion(
          question.get("type"),
          question.get("label"),
          "yes".equalsIgnoreCase(question.get("required")),
          options == null || options.isBlank()
              ? List.of()
              : Arrays.stream(options.split(",")).map(String::trim).toList());
    }
    world.formTitle = title;
  }

  @When("they add a rule: show {string} when {string} equals {string}")
  public void theyAddARule(String target, String source, String value) {
    new BuilderPage(world).addRule("show", target, source, "equals", value);
  }

  @When("they save the form")
  public void theySaveTheForm() {
    new BuilderPage(world).save();
    world.formId = findFormId(world.formTitle);
  }

  /** The id of the signed-in organization's form with this title, if it was created. */
  private String findFormId(String title) {
    JsonNode forms = world.api.send("GET", "/api/forms?limit=100", world.actor("current").token(), null).body();
    for (JsonNode form : forms.path("items")) {
      if (title.equals(form.path("name").asText())) return form.path("id").asText();
    }
    return null;
  }

  @Then("the builder says {string}")
  public void theBuilderSays(String message) {
    assertThat(new BuilderPage(world).status()).isEqualTo(message);
  }

  @Then("{string} is listed on the dashboard")
  public void isListed(String title) {
    assertThat(new DashboardPage(world).open().formTitles()).contains(title);
  }

  @Then("{string} is not listed on the dashboard")
  public void isNotListed(String title) {
    assertThat(new DashboardPage(world).open().formTitles()).doesNotContain(title);
  }

  @When("they disable {string} on the dashboard")
  public void theyDisable(String title) {
    new DashboardPage(world).open().disable(title);
  }

  @When("they delete {string} from the dashboard")
  public void theyDelete(String title) {
    new DashboardPage(world).open().delete(title);
  }

  @Then("{string} has no delete button")
  public void hasNoDeleteButton(String title) {
    assertThat(new DashboardPage(world).canDelete(title)).isFalse();
  }
}
