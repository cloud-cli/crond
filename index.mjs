import { CronJob } from "cron";
import { spawn, exec as sh } from "node:child_process";
import * as Yaml from "js-yaml";
import { join, dirname } from "node:path";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  openSync,
} from "node:fs";

const loadYaml = Yaml.default.load;
const CWD = process.cwd();
const logsFolder = process.env.CRON_LOGS_FOLDER || "/tmp/cronjobs";
const jobsFileName = process.env.CRON_JOBS_FILE || "jobs";
const restartInterval = Number(process.env.CRON_RESTART_INTERVAL || 5000);
const debug = !!process.env.DEBUG;
const waitFor = (s) =>
  new Promise((resolve, reject) => {
    s.on("exit", (code) => (code == 0 ? resolve() : reject(code)));
    s.on("error", reject);
  });

export function start() {
  mkdirSync(join(logsFolder), { recursive: true });
  const { jobs = [], services = [] } = loadJobs();

  if (!jobs.length && !services.length) {
    console.log("Nothing to run.");
  }

  for (const job of jobs) {
    createJob(job);
  }

  for (const service of services) {
    createService(service);
  }
}

export function createJob(job) {
  debug &&
    console.log(`[${job.name}] registered with interval "${job.interval}"`);

  new CronJob(
    job.interval,
    function onTick() {
      runJob(job);
    },
    null,
    true
  );
}

export function startDaemon(args = []) {
  const stdout = openSync(join(logsFolder, "crond.log"), "a");
  const child = spawn("node", [process.argv[1], ...args], {
    detached: true,
    stdio: ["ignore", stdout, stdout],
  });

  child.unref();
}

export function createLogLine(file, options) {
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

export async function runJob(job) {
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
        env: { ...process.env, ...(job.env || {}) },
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

export function createLogStream(name) {
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

export function createService(service) {
  const jobNameSanitized = service.name.replace(/\s+/g, "-");
  const log = createLogStream(jobNameSanitized);
  log.write("Starting service " + service.name + "\n");

  const p = sh(service.command, {
    cwd: service.cwd || CWD,
    env: { ...process.env, ...(service.env || {}) },
  });

  p.stdout.pipe(log);
  p.stderr.pipe(log);

  p.on("exit", (code) => {
    log.write("[CRON] service exited with code " + code);

    if (service.restart !== false) {
      setTimeout(
        () => createService(service),
        service.restartInterval || restartInterval
      );
    }
  });

  p.service = service;

  return p;
}

export function findJobsFile() {
  const fromArgs = process.argv[2] || "";
  const extensions = ["yaml", "yml", "json"];
  const candidates = [
    ...((fromArgs && [fromArgs, join(CWD, fromArgs)]) || []),
    ...[
      join(CWD, jobsFileName),
      join(process.env.HOME || "", jobsFileName),
    ].flatMap((f) => extensions.map((e) => f + "." + e)),
  ];

  return candidates.find((f) => {
    debug && console.log("Trying " + f);
    return existsSync(f);
  });
}

export function loadJobs() {
  const jobsFile = findJobsFile();

  if (!jobsFile) {
    console.error(`No jobs found. Create a list of jobs first!`);
    process.exit(1);
  }

  try {
    console.log("Loading " + jobsFile);
    const src = readFileSync(jobsFile, "utf8");

    if (jobsFile.endsWith(".yaml") || jobsFile.endsWith(".yml")) {
      return loadYaml(src);
    } else {
      return JSON.parse(src);
    }
  } catch (error) {
    console.error(`Failed to read ${jobsFileName}: ${String(error)}!`);
    process.exit(1);
  }
}
