package com.forma.e2e.steps;

import static org.assertj.core.api.Assertions.assertThat;

import com.forma.e2e.pages.AnalyticsPage;
import com.forma.e2e.pages.PublicFormPage;
import com.forma.e2e.support.World;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import java.util.Map;
import org.openqa.selenium.support.ui.WebDriverWait;

public class AnalyticsSteps {

  private final World world;

  public AnalyticsSteps(World world) {
    this.world = world;
  }

  /** Waits until the app has recorded {@code count} started visits to the form. */
  private void waitForStartedVisits(long count) {
    new WebDriverWait(world.driver(), world.config.timeout())
        .until(
            d ->
                world.db.number(
                        "SELECT count(*) FROM \"FormSession\" WHERE \"formId\" = ? AND \"startedAt\" IS NOT NULL",
                        world.formId)
                    >= count);
  }

  @Given("one respondent answered {string} and then left the form")
  public void oneRespondentLeft(String label) {
    world.clearSession();
    PublicFormPage form = new PublicFormPage(world).open(world.formId);
    form.answer(label, "Quinn Quitter");
    waitForStartedVisits(1);
  }

  @Given("another respondent completed the form")
  public void anotherRespondentCompleted() {
    world.clearSession();
    PublicFormPage form = new PublicFormPage(world).open(world.formId);
    form.answer("Your name", "Fin Finisher");
    form.answer("Email", "fin@example.com");
    form.submit();
    form.thankYou();
    // The first visit has now been quiet long enough to count as abandoned.
    world.db.letUnfinishedVisitsGoIdle(world.formId);
    world.signInAs(world.actor("owner"));
  }

  @Given("{int} respondents have submitted the form")
  public void respondentsHaveSubmitted(int count) {
    for (int i = 1; i <= count; i++) {
      world.api.submit(world.formId, Map.of("name", "Respondent " + i));
    }
  }

  @Then("they are invited to upgrade to Premium")
  public void theyAreInvitedToUpgrade() {
    assertThat(new AnalyticsPage(world).offersUpgrade()).isTrue();
  }

  @Then("the analytics show {int} views, {int} started and {int} completed")
  public void theFunnel(int views, int started, int completed) {
    AnalyticsPage analytics = new AnalyticsPage(world);
    assertThat(analytics.kpi("Views")).isEqualTo(String.valueOf(views));
    assertThat(analytics.kpi("Started")).isEqualTo(String.valueOf(started));
    assertThat(analytics.kpi("Completed")).isEqualTo(String.valueOf(completed));
  }

  @Then("{string} is where most people leave, at {int}%")
  public void whereMostPeopleLeave(String label, int percent) {
    assertThat(new AnalyticsPage(world).dropOffRow(label)).contains("Most people leave here").contains(percent + "%");
  }

  @Then("the analytics show {int} responses")
  public void theResponseCount(int count) {
    assertThat(new AnalyticsPage(world).kpi("Responses")).isEqualTo(String.valueOf(count));
  }

  @Then("the heatmap counts {int} responses")
  public void theHeatmapCounts(int count) {
    assertThat(new AnalyticsPage(world).heatmapTotal()).isEqualTo(count);
  }
}
