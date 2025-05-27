import * as fs from "node:fs";
import * as yaml from "js-yaml";

interface WorkflowJob {
  needs?: string[];
  [key: string]: unknown;
}

interface Workflow {
  jobs: Record<string, WorkflowJob>;
  [key: string]: unknown;
}

const workflow = yaml.load(
  fs.readFileSync("../workflows/test.yml", "utf8"),
) as Workflow;
const jobs = Object.keys(workflow.jobs);
const allTestsPassed = workflow.jobs["all-tests-passed"];
const needs: string[] = allTestsPassed.needs || [];

const expectedNeeds = jobs.filter((j) => j !== "all-tests-passed");
const missing = expectedNeeds.filter((j) => !needs.includes(j));

if (missing.length > 0) {
  console.error(
    `Missing jobs in all-tests-passed needs: ${missing.join(", ")}`,
  );
  console.info(
    "Please add the missing jobs to the needs section of all-tests-passed in test.yml.",
  );
  process.exit(1);
}
console.log(
  "All jobs in test.yml are in the needs section of all-tests-passed.",
);
