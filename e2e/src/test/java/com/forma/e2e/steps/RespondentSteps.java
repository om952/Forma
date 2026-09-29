package com.forma.e2e.steps;

import static org.assertj.core.api.Assertions.assertThat;

import com.forma.e2e.pages.PublicFormPage;
import com.forma.e2e.pages.ResponsesPage;
import com.forma.e2e.support.Api;
import com.forma.e2e.support.World;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class RespondentSteps {

  /** A 1x1 PNG. */
  private static final byte[] PNG =
      Base64.getDecoder()
          .decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4DwABAQEABRjYTgAAAABJRU5ErkJggg==");

  private final World world;
  private Path downloaded;

  public RespondentSteps(World world) {
    this.world = world;
  }

  /** Field ids of the default form built by {@link Api#defaultQuestions()}. */
  private static String idOf(String label) {
    return switch (label) {
      case "Your name" -> "name";
      case "Email" -> "email";
      default -> throw new IllegalArgumentException("No question labelled " + label + " on the default form");
    };
  }

  @When("a respondent opens the form")
  public void aRespondentOpensTheForm() {
    new PublicFormPage(world).open(world.formId);
  }

  @When("they answer {string} with {string}")
  public void theyAnswer(String label, String value) {
    new PublicFormPage(world).answer(label, value);
  }

  @When("they attach an image to {string}")
  public void theyAttachAnImage(String label) throws IOException {
    Path image = Files.createTempFile(world.downloads(), "photo", ".png");
    Files.write(image, PNG);
    new PublicFormPage(world).attach(label, image);
  }

  @When("they submit the form")
  public void theySubmit() {
    new PublicFormPage(world).submit();
  }

  @Then("they are thanked with {string}")
  public void theyAreThanked(String message) {
    assertThat(new PublicFormPage(world).thankYou()).contains(message);
  }

  @Then("the form is not sent because {string} is required")
  public void theFormIsNotSent(String label) {
    PublicFormPage form = new PublicFormPage(world);
    assertThat(form.isBlockedByRequired(label)).isTrue();
    assertThat(form.shows("Thank you!")).isFalse();
  }

  @Then("the question {string} is not asked")
  public void theQuestionIsNotAsked(String label) {
    assertThat(new PublicFormPage(world).asks(label)).isFalse();
  }

  @Then("the question {string} is asked")
  public void theQuestionIsAsked(String label) {
    new PublicFormPage(world).waitUntilAsks(label);
  }

  @Then("the respondent is told {string}")
  public void theRespondentIsTold(String message) {
    assertThat(new PublicFormPage(world).problem()).contains(message);
  }

  @Given("a respondent has answered {string} with {string}")
  public void aRespondentHasAnswered(String label, String value) {
    world.api.submit(world.formId, Map.of(idOf(label), value));
  }

  @Given("the form also asks for a file called {string}")
  public void theFormAlsoAsksForAFile(String label) {
    List<Map<String, Object>> questions = new ArrayList<>(Api.defaultQuestions());
    Map<String, Object> file = new HashMap<>();
    file.put("id", "attachment");
    file.put("type", "file");
    file.put("label", label);
    file.put("required", false);
    questions.add(file);
    world.api.updateQuestions(world.actor("owner"), world.formId, questions);
  }

  @When("the owner opens the responses to the form")
  public void theOwnerOpensTheResponses() {
    new ResponsesPage(world).open(world.formId);
  }

  @Then("they see a response containing {string}")
  public void theySeeAResponse(String text) {
    assertThat(new ResponsesPage(world).responses()).anyMatch(response -> response.contains(text));
  }

  @When("the owner downloads the responses as CSV")
  public void theOwnerDownloadsCsv() {
    downloaded = new ResponsesPage(world).open(world.formId).exportCsv();
  }

  @Then("the file has a row containing {string}")
  public void theFileHasARow(String text) throws IOException {
    List<String> lines = Files.readAllLines(downloaded);
    assertThat(lines.get(0)).contains("Your name").contains("Submitted At");
    assertThat(lines.subList(1, lines.size())).anyMatch(line -> line.contains(text));
  }

  @Then("the owner sees a link to the uploaded file among the responses")
  public void theOwnerSeesTheFileLink() {
    world.signInAs(world.actor("owner"));
    assertThat(new ResponsesPage(world).open(world.formId).fileLinks()).isNotEmpty();
  }
}
