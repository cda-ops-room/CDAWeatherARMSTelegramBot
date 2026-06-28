# Setup Guide for CDA Weather ARMS Telegram Bot

This guide is written for a handover. You do not need to know programming to follow it.

By the end, you will have your own Telegram bot running on Fly.io, using your own Telegram bot token, data.gov.sg API key, and Redis database.

## What this bot does

This bot sends CDA and HTTC weather updates on Telegram.

It can:

- let users subscribe with `/start`
- send scheduled weather updates on weekdays at `09:50`, `11:50`, `13:50`, and `15:50` Singapore time
- let users check weather with `/weather`
- let users check lightning risk with `/lightning`
- let the owner send announcements with `/announcement <message>`

## Accounts and items you need

Before starting, prepare these accounts:

- A Telegram account
- A GitHub account or a downloaded copy of this repository
- A Fly.io account
- A data.gov.sg account
- A payment method on Fly.io if Fly.io asks for billing details

You will also create or collect these values:

| Value | What it is used for |
| --- | --- |
| `BOT_ID` | The Telegram bot token from BotFather |
| `DATA_GOV_API_KEY` | The data.gov.sg API key for weather and lightning data |
| `REDIS_HOST` | The Redis database host from Fly.io Upstash Redis |
| `REDIS_PORT` | The Redis database port, normally `6379` |
| `REDIS_PASSWORD` | The Redis database password |
| `HOST` | The public Fly.io URL for the bot |
| `SECRET_TOKEN` | A private webhook security token |
| `OWNER_USER_ID` | Your personal Telegram user ID |

Important: treat `BOT_ID`, `DATA_GOV_API_KEY`, `REDIS_PASSWORD`, and `SECRET_TOKEN` like passwords. Do not send them in chat groups or commit them to GitHub.

## Step 1: Get the bot files

You need a copy of this repository on your computer.

If someone has handed you a zip file, unzip it.

If someone has given you a GitHub link:

1. Open the GitHub repository in your browser.
2. Click `Code`.
3. Click `Download ZIP`.
4. Unzip the downloaded file.

You should now have a folder containing files such as:

- `README.md`
- `SETUP.md`
- `package.json`
- `fly.toml`
- `Dockerfile`
- `index.ts`
- `bot.ts`

## Step 2: Install Fly.io on your computer

Fly.io is the service that will host the bot online.

1. Open the official Fly.io install page: https://fly.io/docs/flyctl/install/
2. Follow the instructions for your computer.
3. After installing, open Terminal.

On macOS, Terminal is in:

```text
Applications > Utilities > Terminal
```

Log in to Fly.io by running:

```bash
fly auth login
```

A browser window may open. Sign in or create an account.

## Step 3: Choose a Fly.io app name

Your Fly.io app name becomes part of the public URL.

Example:

```text
cda-weather-arms-bot-yourname
```

The public URL will become:

```text
https://cda-weather-arms-bot-yourname.fly.dev
```

Rules for the app name:

- use lowercase letters
- use numbers if needed
- use hyphens instead of spaces
- choose something unique

In the rest of this guide, replace:

```text
<YOUR_FLY_APP_NAME>
```

with the name you chose.

## Step 4: Update `fly.toml`

Open the file called `fly.toml` in the bot folder.

Find this line:

```toml
app = 'cda-weather-arms-bot'
```

Replace `cda-weather-arms-bot` with your Fly.io app name.

Example:

```toml
app = 'cda-weather-arms-bot-yourname'
```

Save the file.

## Step 5: Open Terminal in the bot folder

In Terminal, go into the bot folder.

For example, if the folder is in Downloads, the command may look like this:

```bash
cd ~/Downloads/cda_weather_arms_bot
```

If you are not sure what to type:

1. Type `cd ` with a space after it.
2. Drag the bot folder into the Terminal window.
3. Press Enter.

To confirm you are in the correct folder, run:

```bash
ls
```

You should see files such as `package.json`, `fly.toml`, and `Dockerfile`.

## Step 6: Create the Fly.io app

Run this command, replacing `<YOUR_FLY_APP_NAME>` with your chosen app name:

```bash
fly apps create <YOUR_FLY_APP_NAME>
```

If Fly.io says the name is already taken, choose a different name, update `fly.toml` again, and rerun the command.

## Step 7: Create a Telegram bot and get `BOT_ID`

Telegram bots are created through Telegram's official BotFather account.

1. Open Telegram.
2. Search for `@BotFather`.
3. Make sure it is the official verified BotFather account.
4. Send this message to BotFather:

```text
/newbot
```

5. BotFather will ask for a display name. Example:

```text
CDA Weather ARMS Bot
```

6. BotFather will ask for a username. It must end with `bot`. Example:

```text
cda_weather_arms_yourname_bot
```

7. BotFather will send you a token.

The token looks roughly like this:

```text
1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ
```

This token is your `BOT_ID`.

Do not share it publicly.

Optional but recommended: set the bot commands shown in Telegram.

Send this to BotFather:

```text
/mybots
```

Choose your bot, then choose:

```text
Edit Bot > Edit Commands
```

Paste this:

```text
start - Subscribe to scheduled weather updates
weather - Check the latest CDA and HTTC weather
lightning - Check lightning near CDA or HTTC
settings - Change your subscription
help - Show help
announcement - Owner only: send an announcement
```

## Step 8: Get your Telegram user ID for `OWNER_USER_ID`

The owner user ID controls who can use `/announcement`.

One simple way:

1. Open Telegram.
2. Search for `@userinfobot`.
3. Start the bot.
4. It will show your Telegram user ID.

Copy the numeric ID. It will look like:

```text
123456789
```

This is your `OWNER_USER_ID`.

## Step 9: Get a data.gov.sg API key

The bot uses data.gov.sg for weather and lightning data.

Official guide: https://guide.data.gov.sg/developer-guide/api-overview/how-to-request-an-api-key

1. Go to https://data.gov.sg
2. Log in from the top-right corner.
3. If you are a new user, sign up first.
4. Go to the API key area.
5. Click `Create API Key`.
6. Choose a key type.

For a live bot, use a production key if data.gov.sg offers that option to you.

7. Copy the API key when it is shown.

Important: data.gov.sg may only show the key once. Save it somewhere secure.

This is your `DATA_GOV_API_KEY`.

## Step 10: Create Redis on Fly.io

Redis is the small database used by the bot to remember who subscribed to which rota.

Run:

```bash
fly redis create
```

Fly.io will ask a few questions.

Suggested answers:

- Organization: choose your own organization or personal account
- Primary region: choose `Singapore (sin)` if available
- Replica regions: you can leave this blank for a simple setup
- Plan: choose the lowest suitable plan for your usage

After it is created, list your Redis databases:

```bash
fly redis list
```

Find the Redis database name in the list.

Then run this, replacing `<YOUR_REDIS_DATABASE_NAME>`:

```bash
fly redis status <YOUR_REDIS_DATABASE_NAME>
```

Look for a line called `Private URL`.

It will look similar to one of these:

```text
redis://some-password@fly-some-redis-name.upstash.io
redis://default:some-password@fly-some-redis-name.upstash.io:6379
```

From that URL:

- `REDIS_PASSWORD` is the password before `@`
- if the URL contains `default:`, do not include `default:` in the password
- `REDIS_HOST` is the host after `@`, without `:6379`
- `REDIS_PORT` is the number after the host, normally `6379`

Example:

```text
Private URL: redis://abc123@fly-my-redis.upstash.io
```

means:

```text
REDIS_PASSWORD=abc123
REDIS_HOST=fly-my-redis.upstash.io
REDIS_PORT=6379
```

Another example:

```text
Private URL: redis://default:abc123@fly-my-redis.upstash.io:6379
```

means:

```text
REDIS_PASSWORD=abc123
REDIS_HOST=fly-my-redis.upstash.io
REDIS_PORT=6379
```

## Step 11: Create `SECRET_TOKEN`

The bot uses `SECRET_TOKEN` so Telegram webhook requests can be checked safely.

Run this in Terminal:

```bash
openssl rand -base64 32
```

Copy the output.

This is your `SECRET_TOKEN`.

## Step 12: Prepare your final environment values

You should now have everything needed.

Fill in this checklist for yourself:

```text
BOT_ID=<token from BotFather>
DATA_GOV_API_KEY=<key from data.gov.sg>
REDIS_HOST=<host from Fly Redis Private URL>
REDIS_PORT=6379
REDIS_PASSWORD=<password from Fly Redis Private URL>
HOST=https://<YOUR_FLY_APP_NAME>.fly.dev
PORT=8080
SECRET_TOKEN=<random token from openssl>
NODE_ENV=production
OWNER_USER_ID=<your Telegram numeric user ID>
```

Do not save this checklist inside the public repository.

## Step 13: Add the environment values to Fly.io

Fly.io stores private values as secrets.

Run the command below after replacing every placeholder.

Keep the quotes.

```bash
fly secrets set \
  BOT_ID="<YOUR_TELEGRAM_BOT_TOKEN>" \
  DATA_GOV_API_KEY="<YOUR_DATA_GOV_API_KEY>" \
  REDIS_HOST="<YOUR_REDIS_HOST>" \
  REDIS_PORT="6379" \
  REDIS_PASSWORD="<YOUR_REDIS_PASSWORD>" \
  HOST="https://<YOUR_FLY_APP_NAME>.fly.dev" \
  PORT="8080" \
  SECRET_TOKEN="<YOUR_SECRET_TOKEN>" \
  NODE_ENV="production" \
  OWNER_USER_ID="<YOUR_TELEGRAM_USER_ID>"
```

If Terminal shows a deployment starting after setting secrets, that is normal.

## Step 14: Deploy the bot

Run:

```bash
fly deploy
```

Wait until it finishes.

If it succeeds, Fly.io will show a success message.

## Step 15: Check that the bot is online

Open this URL in your browser, replacing `<YOUR_FLY_APP_NAME>`:

```text
https://<YOUR_FLY_APP_NAME>.fly.dev/health
```

You should see text that includes:

```json
{
  "status": "ok"
}
```

If you see `"status": "ok"`, the app is running.

## Step 16: Test the Telegram bot

1. Open Telegram.
2. Search for your bot username.
3. Press `Start`.
4. The bot should ask you to choose a subscription.
5. Choose `Rota 1`, `Rota 2`, `Rota 3`, or `Office Hours`.
6. Send:

```text
/weather
```

The bot should reply with the latest CDA and HTTC weather.

Then send:

```text
/lightning
```

The bot should ask you to choose CDA or HTTC.

## Step 17: Test owner announcements

From the Telegram account whose ID you used as `OWNER_USER_ID`, send:

```text
/announcement Test announcement from the new bot owner.
```

The bot should send the announcement to subscribed chats.

If you get:

```text
You are not authorized to use this command.
```

then `OWNER_USER_ID` is wrong. Check your Telegram user ID again and update the Fly secret.

To update just that value:

```bash
fly secrets set OWNER_USER_ID="<CORRECT_TELEGRAM_USER_ID>"
```

## Useful Fly.io commands

Check app status:

```bash
fly status
```

View live logs:

```bash
fly logs
```

Open the app in a browser:

```bash
fly apps open
```

Redeploy after changes:

```bash
fly deploy
```

Update one secret:

```bash
fly secrets set NAME="new value"
```

Example:

```bash
fly secrets set DATA_GOV_API_KEY="new-data-gov-key"
```

## How the webhook works

You do not need to manually set the Telegram webhook.

When the Fly.io app starts, the code automatically tells Telegram to send messages to:

```text
https://<YOUR_FLY_APP_NAME>.fly.dev/telegram-webhook
```

That is why the `HOST` secret must be exactly:

```text
https://<YOUR_FLY_APP_NAME>.fly.dev
```

Do not add a slash at the end.

Correct:

```text
https://my-bot.fly.dev
```

Wrong:

```text
https://my-bot.fly.dev/
```

## Troubleshooting

### The `/health` page does not open

Run:

```bash
fly status
```

Then run:

```bash
fly logs
```

Look for errors about missing environment variables, Redis connection, or build failure.

### The bot does not reply in Telegram

Check these:

- `BOT_ID` is copied exactly from BotFather
- `HOST` is exactly `https://<YOUR_FLY_APP_NAME>.fly.dev`
- the Fly app is running
- `/health` shows `"status": "ok"`
- `SECRET_TOKEN` is set and the app was redeployed after setting it

### The app says an environment variable is missing

Run:

```bash
fly secrets list
```

Check that these names exist:

```text
BOT_ID
DATA_GOV_API_KEY
REDIS_HOST
REDIS_PORT
REDIS_PASSWORD
HOST
PORT
SECRET_TOKEN
NODE_ENV
OWNER_USER_ID
```

For security reasons, Fly.io will not show the secret values, only the names.

If one is missing, add it with:

```bash
fly secrets set NAME="value"
```

### Redis errors appear in the logs

Check:

- `REDIS_HOST` is the host after `@` in the Redis Private URL
- `REDIS_PASSWORD` is the password before `@` in the Redis Private URL
- `REDIS_PORT` is `6379`
- the Redis database and the Fly app are in the same Fly.io organization

### Weather or lightning does not work

Check:

- `DATA_GOV_API_KEY` is correct
- the key has not expired or been deleted
- data.gov.sg is reachable
- Fly logs do not show API errors

### `/announcement` says you are not authorized

Check that `OWNER_USER_ID` is your numeric Telegram user ID, not your Telegram username.

Correct:

```text
123456789
```

Wrong:

```text
@myusername
```

### Scheduled messages are not sent

The bot only sends scheduled updates:

- Monday to Friday
- Singapore time
- at `09:50`, `11:50`, `13:50`, and `15:50`
- to users who subscribed with `/start`

For rota users, only the rota assigned for that date receives scheduled rota updates. `Office Hours` subscribers receive all weekday scheduled updates.

## Handover notes

Give the new owner these things securely:

- access to the Fly.io app
- access to the Fly.io Redis database
- the Telegram BotFather ownership or admin access for the bot
- the data.gov.sg account or API key ownership
- this repository

Do not hand over secrets inside a public GitHub issue, public chat, or public document.

## Official references

- Telegram BotFather tutorial: https://core.telegram.org/bots/tutorial
- Fly.io launch guide: https://fly.io/docs/getting-started/launch/
- Fly.io secrets command: https://fly.io/docs/flyctl/secrets-set/
- Fly.io Upstash Redis guide: https://fly.io/docs/reference/redis/
- data.gov.sg API key guide: https://guide.data.gov.sg/developer-guide/api-overview/how-to-request-an-api-key
