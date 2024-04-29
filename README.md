# crond

Crontab-like runner

## Install

```sh
npm i -g @cloud-cli/crond
```

> Make sure the global NPM folder is part of `$PATH`.

## Usage

- Create `jobs.json` at either `$HOME/jobs.json` or the current folder.
- run `crond` from a shell.

## Environment variables

| name | description |
|-|-|
| CRON_LOGS_FOLDER | Path to a folder where logs will be placed per job. Default is `/tmp/cronjobs` |
| CRON_JOBS_FILE | Name of the JSON file where jobs are defined. Default is `jobs.json` |
| DEBUG | Set it to get debug logs from `crond` |
