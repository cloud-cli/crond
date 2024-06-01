#!/usr/bin/env node

import { CronJob } from "cron";
import { spawn, exec as sh } from "node:child_process";
import * as Yaml from "js-yaml";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  openSync,
} from "node:fs";
import { join, dirname } from "node:path";

const loadYaml = Yaml.default.load;
const CWD = process.cwd();
const logsFolder = process.env.CRON_LOGS_FOLDER || "/tmp/cronjobs";
const jobsFileName = process.env.CRON_JOBS_FILE || "jobs";
const debug = !!process.env.DEBUG;

function start() {
  mkdirSync(join(logsFolder), { recursive: true });
  const { jobs = [], services = [] } = loadJobs();

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

  services.map((s) => startService(s));
}

function startDaemon() {
  const stdout = openSync(join(logsFolder, "crond.log"), "a");
  const cwd = dirname(process.argv[1]);
  const child = spawn("node", ["index.mjs"], {
    cwd,
    detached: true,
    stdio: ["ignore", stdout, stdout],
  });

  child.unref();
}

const waitFor = (s) =>
  new Promise((resolve, reject) => {
    s.on("exit", (code) => (code == 0 ? resolve() : reject(code)));
    s.on("error", reject);
  });

function createLogLine(file, options) {
  const log = createWriteStream(file, options);
  const write = log.write;

  log.write = (chunk, ...args) =>
    log.writable &&
    write.apply(log, [
      String(chunk)
        .split("\n")
        .map((line) =>
          line ? `[${new Date().toISOString().slice(0, 19)}] ${line}` : ""
        )
        .join("\n"),
      ...args,
    ]);

  return log;
}

async function runJobCommands(job) {
  const jobNameSanitized = job.name.replace(/\s+/g, "-");
  const log = createLogStream(jobNameSanitized);
  log.write("Starting " + job.name + "\n");

  try {
    const commands = Array.isArray(job.commands)
      ? job.commands
      : [job.commands || job.command];

    for (const command of commands) {
      log.write(`${command}\n`);

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

function createLogStream(name) {
  const file = join(logsFolder, name + ".log");

  let start = 0;
  let flags = "w";

  if (existsSync(file)) {
    start = statSync(file).size;
    flags = "r+";
  }

  const log = createLogLine(file, { start, flags });

  return log;
}

function startService(service) {
  const jobNameSanitized = service.name.replace(/\s+/g, "-");
  const log = createLogStream(jobNameSanitized);
  log.write("Starting service " + service.name + "\n");

  const p = sh(service.command, {
    cwd: service.cwd || CWD,
    env: { ...process.env, ...(service.env || {}) },
  });

  p.stdout.pipe(log);
  p.stderr.pipe(log);

  return p;
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
      return JSON.parse(src);
    }
  } catch (error) {
    console.error(`Failed to read ${jobsFileName}: ${String(error)}!`);
    process.exit(1);
  }
}

if (process.argv[2] == "-d" || process.argv[2] === "--daemon") {
  startDaemon();
} else {
  start();
}
