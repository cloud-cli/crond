#!/usr/bin/env node

import { CronJob } from "cron";
import { exec as sh } from "node:child_process";
import * as Yaml from "js-yaml";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { join } from "node:path";

const loadYaml = Yaml.default.load;
const CWD = process.cwd();
const logsFolder = process.env.CRON_LOGS_FOLDER || "/tmp/cronjobs";
const jobsFileName = process.env.CRON_JOBS_FILE || "jobs";
const debug = !!process.env.DEBUG;

function start() {
  mkdirSync(join(logsFolder), { recursive: true });
  const jobs = loadJobs();

  for (const job of jobs) {
    debug &&
      console.log(`[${job.name}] registered with interval "${job.interval}"`);

    new CronJob(
      job.interval,
      function onTick() {
        runJobCommands(job);
      },
      null,
      true
    );
  }
}

const waitFor = (s) =>
  new Promise((resolve, reject) => {
    s.on("exit", resolve);
    s.on("error", reject);
  });

async function runJobCommands(job) {
  const jobNameSanitized = job.name.replace(/\s+/g, "-");
  const file = join(logsFolder, jobNameSanitized + ".log");
  const stats = statSync(file);
  const log = createWriteStream(file, { start: stats.size, flags: "r+" });

  log.write("Starting " + job.name + "\n");

  try {
    for (const command of job.commands) {
      log.write(`[${new Date().toISOString().slice(0, 19)}] ${command}\n`);

      const p = sh(command, {
        cwd: job.cwd || CWD,
        env: process.env,
      });

      p.stdout.pipe(log);
      p.stderr.pipe(log);

      await waitFor(p);
    }

    log.write("\n[OK]\n");
  } catch (error) {
    log.write("[ERROR] " + String(error) + "\n");
    console.error(error);
  } finally {
    log.close();
  }
}

function findJobsFile() {
  const extensions = ["yaml", "yml", "json"];
  const candidates = [
    join(CWD, jobsFileName),
    join(process.env.HOME || "", jobsFileName),
  ].flatMap((f) => extensions.map((e) => f + "." + e));

  return candidates.find((f) => {
    debug && console.log("Trying " + f);
    return existsSync(f);
  });
}

function loadJobs() {
  const jobsFile = findJobsFile();

  if (!jobsFile) {
    console.error(`No jobs found. Create a list of jobs first!`);
    process.exit(1);
  }

  try {
    const src = readFileSync(jobsFile, "utf8");

    if (jobsFile.endsWith(".yaml") || jobsFile.endsWith(".yml")) {
      const json = loadYaml(src);
      return json.jobs;
    } else {
      const json = JSON.parse(src);
      return json.jobs;
    }
  } catch (error) {
    console.error(`Failed to read ${jobsFileName}: ${String(error)}!`);
    process.exit(1);
  }
}

start();
