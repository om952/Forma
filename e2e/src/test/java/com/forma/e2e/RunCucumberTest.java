package com.forma.e2e;

import org.junit.platform.suite.api.IncludeEngines;
import org.junit.platform.suite.api.SelectClasspathResource;
import org.junit.platform.suite.api.Suite;

/**
 * Runs every scenario under src/test/resources/features on the JUnit Platform.
 * Settings (glue, reports) are in junit-platform.properties.
 */
@Suite
@IncludeEngines("cucumber")
@SelectClasspathResource("features")
public class RunCucumberTest {}
