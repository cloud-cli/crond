#!/usr/bin/env node

import { start, startDaemon } from "./index.mjs";

if (process.argv[2] == "-d" || process.argv[2] === "--daemon") {
  startDaemon();
} else {
  start();
}
