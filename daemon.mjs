#!/usr/bin/env node

import { spawn } from "child_process";
import { openSync } from "fs";
import { join } from "path";

const logsFolder = process.env.CRON_LOGS_FOLDER || "/tmp/cronjobs";
const stdout = openSync(join(logsFolder, "crond.log"), "a");
const child = spawn("node", ["index.mjs"], {
  cwd: process.cwd(),
  detached: true,
  stdio: ["ignore", stdout, stdout],
});

const flag = process.argv[2];
if (flag == "-d" || flag === "--daemon") {
  child.unref();
}
