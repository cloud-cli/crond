# crond

A crontab-like runner using [NPM cron package](https://npmjs.com/cron).

> Oh, but why can't you just use crontab? What's this?

Well, I could. But maybe I want to run cronjobs on my phone or inside a container and I don't want to fiddle with the host file system. This is completely userland.

## Install

```sh
npm i -g @cloud-cli/crond
```

> Make sure the global NPM folder is part of `$PATH`.

## Usage

- run `crond` to schedule jobs defined in the configuration file
- run `crond -d` or `crond --daemon` to detach from your shell (run in the background, like a daemon)
- the daemon writes a log to `$CRON_LOGS_FOLDER/crond.log`

## Environment variables

| name | description |
|-|-|
| CRON_LOGS_FOLDER | Path to a folder where logs will be placed per job. Default is `/tmp/cronjobs` |
| CRON_JOBS_FILE | Name of the JSON file where jobs are defined. Default is `jobs.json` |
| DEBUG | Set it to get debug logs from `crond` |

## Jobs file format

- Create `jobs.json` or `jobs.yaml` at either `$HOME` or the current folder.
- Each job can have one or more commands to execute.
- The current folder can be specified
- Interval follows the same syntax as crontab. Use [https://crontab.guru/](https://crontab.guru/) to verify
- Give it a short name. This name is used to create the output log file.

```yaml
jobs:
  - name: job-name
    interval: '0/5 * * *'
    cwd: /tmp/abc
    commands:
      - echo "Hello mom!"
      - cat file.txt
      - wget https://example.com

  - name: another-job-name
    interval: '0 0 * * *'
    cwd: /tmp/abc
    command: npm update

services:
  - name: http-server
    restart: true
    restartInterval: 5000
    cwd: /var/www
    command: node /opt/http.js
```
