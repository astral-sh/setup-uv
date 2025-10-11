"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var fs = require("node:fs");
var yaml = require("js-yaml");
var workflow = yaml.load(fs.readFileSync("../workflows/test.yml", "utf8"));
var jobs = Object.keys(workflow.jobs);
var allTestsPassed = workflow.jobs["all-tests-passed"];
var needs = allTestsPassed.needs || [];
var expectedNeeds = jobs.filter(function (j) { return j !== "all-tests-passed"; });
var missing = expectedNeeds.filter(function (j) { return !needs.includes(j); });
if (missing.length > 0) {
    console.error("Missing jobs in all-tests-passed needs: ".concat(missing.join(", ")));
    console.info("Please add the missing jobs to the needs section of all-tests-passed in test.yml.");
    process.exit(1);
}
console.log("All jobs in test.yml are in the needs section of all-tests-passed.");
