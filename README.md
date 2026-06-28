# CDA Weather ARMS Bot

Telegram bot for CDA and HTTC weather reporting. It sends scheduled WBGT and air temperature updates before ARMS reporting windows, supports rota-based subscriptions, and lets users request live weather or lightning checks on demand.

If you want to use the bot as an end user, start with the GitHub wiki:

- [Getting Started (User Guide)](https://github.com/nabilridhwan/CDAWeatherARMSTelegramBot/wiki/Getting-Started-(User-Guide))

## Screenshots

| Welcome | `/weather` | Scheduled update |
| --- | --- | --- |
| ![Welcome screen](docs/welcome.png) | ![Weather command example](docs/weather.png) | ![Scheduled weather update example](docs/weather-update.png) |

## Disclaimer

This is a personal project and is not affiliated with or endorsed by:

- Civil Defence Academy (CDA)
- National Environment Agency (NEA)
- Singapore Civil Defence Force (SCDF)

## What The Project Does

The bot currently handles:

- scheduled weekday weather updates at `09:50`, `11:50`, `13:50`, and `15:50` Singapore time
- rota-based subscriptions for `Rota 1`, `Rota 2`, `Rota 3`, or `office_hours`
- on-demand `/weather` snapshots for CDA and HTTC
- on-demand `/lightning` checks for CDA and HTTC
- owner-only `/announcement` broadcasts to all subscribed chats
- Telegram webhook handling with header-based secret validation
- Redis-backed distributed locking so multiple app instances do not double-send scheduled messages
- Redis-backed quarter-hour weather caching to reduce repeated upstream API calls
- basic operational HTTP endpoints for health and logs

The app exposes:

- `POST /telegram-webhook`
- `GET /health`
- `GET /logs`

## Bot Commands

- `/start` subscribes a user and shows schedule options
- `/weather` returns the latest CDA and HTTC weather snapshot
- `/lightning` lets the user choose CDA or HTTC and checks nearby lightning activity
- `/settings` changes rota/office-hours subscription or unsubscribes
- `/help` shows a short usage summary
- `/announcement <message>` sends a broadcast to all subscribed chats, but only for `OWNER_USER_ID`

## Runtime Behavior

### Schedule model

The scheduler lives in `utils/bot/rule.ts`.

- weekdays only, Monday to Friday
- run times: `09:50`, `11:50`, `13:50`, `15:50`
- timezone: Singapore

### Rota model

The rota logic lives in `utils/schedule/rota.ts`.

- reference date: `2025-10-06T00:00:00+08:00`
- rota on that date: `Rota 3`
- cycle order: `3 -> 2 -> 1 -> 3 -> ...`

At each scheduled run:

- all `office_hours` subscribers receive the update
- subscribers on the rota matching that date also receive the update

### Weather data flow

- WBGT comes from the data.gov.sg real-time weather API
- air temperature comes from the data.gov.sg air-temperature API
- CDA and HTTC readings are resolved using the nearest available station to each fixed coordinate
- outbound weather replies are cached in Redis by quarter-hour window
- weather API requests retry on transient timeout, rate-limit, and `5xx` failures

### Lightning flow

- lightning data comes from the data.gov.sg real-time lightning API
- the bot checks strikes within `10 km` of CDA or HTTC
- it also reports whether lightning was only detected elsewhere in Singapore

### Delivery and reliability

- all outbound Telegram sends go through a shared `p-queue`
- queue settings are currently `concurrency=5`, `intervalCap=20`, `interval=1000ms`
- Telegram sends retry up to `3` times on retryable network or Telegram-side failures
- scheduled sends acquire a Redis lock keyed to the minute slot before sending
- shutdown waits for the message queue to drain before closing Redis and stopping the bot

## Architecture

The current codebase is organized by responsibility:

- `index.ts`: process entrypoint, Express server, webhook registration, health/log endpoints, graceful shutdown
- `bot.ts`: Telegraf bot creation, command/action handlers, admin command, scheduler wiring
- `api/weather.api.ts`: weather API integration, retry policy, station lookup
- `api/lightning.api.ts`: lightning API integration and radius checks
- `api/redis.api.ts`: Redis connection, subscription persistence, distributed lock helpers
- `utils/bot/messageQueue.ts`: outbound send queue, retry behavior, error notifications
- `utils/bot/replies.ts`: bot copy and weather/error message formatting
- `utils/bot/rule.ts`: schedule definition
- `utils/schedule/rota.ts`: rota math and Redis key helpers
- `utils/data/weatherCache.ts`: quarter-hour weather caching
- `middleware/verifyTelegramSecretToken.ts`: webhook header validation
- `utils/infra/env.ts`: environment validation
- `utils/infra/logger.ts`: Winston logging
- `tests/`: Vitest coverage for weather parsing, reply formatting, cache helpers, and rota logic

## Tech Stack

- TypeScript
- Node.js
- Express
- Telegraf
- node-schedule
- Redis via `ioredis`
- Winston
- `@t3-oss/env-core` with `zod`
- `axios-retry`
- `p-queue`
- Vitest
- Docker
- Fly.io

## Environment Variables

The app validates its environment on startup. These variables are currently required:

| Variable | Required | Purpose |
| --- | --- | --- |
| `BOT_ID` | Yes | Telegram bot token used by Telegraf |
| `DATA_GOV_API_KEY` | Yes | API key for data.gov.sg weather and lightning endpoints |
| `REDIS_HOST` | Yes | Redis host |
| `REDIS_PORT` | Yes | Redis port |
| `REDIS_PASSWORD` | Yes | Redis password |
| `HOST` | Yes | Public base URL used when registering the Telegram webhook |
| `PORT` | No | HTTP port for Express, defaults to `8080` |
| `SECRET_TOKEN` | No | Telegram webhook secret token; auto-generated if omitted |
| `NODE_ENV` | No | `development`, `test`, or `production`; defaults to `development` |
| `OWNER_USER_ID` | Yes | Telegram user ID allowed to use `/announcement` |

Notes:

- Redis keys are namespaced by environment: `dev:*` outside production and `prod:*` in production.
- `SECRET_TOKEN` is generated at runtime if missing, but setting it explicitly is safer for repeatable deployments.
- `HOST` must be reachable by Telegram because the bot calls `setWebhook()` on startup.

## Local Development

### Install

```bash
npm install
```

### Build

```bash
npm run build
```

### Start

```bash
npm run start
```

Current package scripts:

- `npm run build`
- `npm run start`
- `npm test`

There is no dedicated `dev` script in `package.json` right now.

## Testing

Run the test suite with:

```bash
npm test
```

Current automated tests cover:

- closest-station weather parsing
- fallback/default weather behavior
- weather reply formatting and HTML escaping
- cache-key and TTL helpers
- rota/date calculations

## Operations

### `GET /health`

Returns JSON with:

- service status
- app version
- configured host
- total subscribed chat count
- member counts for `rota_1`, `rota_2`, `rota_3`, and `office_hours`
- next scheduled update time

### `GET /logs`

Reads and returns lines from `logs/app.log`.

## Deployment

The repo includes:

- `Dockerfile` for container builds
- `fly.toml` for Fly.io deployment

Current Fly config targets:

- app name: `cda-weather-arms-bot`
- region: `sin`
- internal port: `8080`
- minimum running machines: `1`

## Current Maintainer Notes

- The README previously referenced `utils/bot/weatherReportSender.ts`, but the current implementation uses `utils/bot/messageQueue.ts`.
- `checkIfUserIsAdmin`, `addAdminUserId`, and `removeAdminUserId` exist in `api/redis.api.ts`, but admin broadcasts currently authorize against `OWNER_USER_ID`, not the Redis admin set.
- Logging writes to both console and `logs/app.log`; make sure the runtime environment allows the app to create that file.
- Both `package-lock.json` and `yarn.lock` are present, but the checked-in scripts and Dockerfile use `npm`.

## License

MIT
