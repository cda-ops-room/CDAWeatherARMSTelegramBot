import schedule from 'node-schedule';
import { randomUUID } from 'node:crypto';
import { Markup, Telegraf } from 'telegraf';
import { Lightning } from './api/lightning.api';
import { Redis } from './api/redis.api';
import { MessageQueue } from './utils/bot/messageQueue';
import {
  buildAlreadySubscribedMessage,
  buildRotaSetSuccessMessage,
  buildSettingsMessages,
  HELP_MESSAGE,
  LOADING_MESSAGE,
  STOP_SUCCESS_MESSAGE,
  WELCOME_SUBSCRIBED_MESSAGE,
} from './utils/bot/replies';
import { rule } from './utils/bot/rule';
import { env } from './utils/infra/env';
import logger from './utils/infra/logger';
import { Rota } from './utils/schedule/rota';
import { CatStatus } from './api/catStatus.api';

export type BotRuntime = {
  bot: Telegraf;
  job: schedule.Job;
};

// Creates the Telegraf instance only when startup calls it.
export function createBot(): Telegraf {
  return new Telegraf(env.BOT_ID);
}

function registerBotActionHandlers(bot: Telegraf, job: schedule.Job) {
  // ==============================
  // #region Callback query handlers for setting rota subscriptions
  // ==============================

  // Set rota 1
  bot.action('set_rota_1', async (ctx) => {
    await Redis.assignRota(1, ctx);
    const nextUpdate = Rota.getNextUpdateDateForRota(1) || job.nextInvocation();
    ctx.editMessageText(buildRotaSetSuccessMessage(1, nextUpdate), {
      parse_mode: 'HTML',
    });
    ctx.answerCbQuery(); // Acknowledge the callback query to remove the loading state
  });

  // Set rota 2
  bot.action('set_rota_2', async (ctx) => {
    // call assignRota
    await Redis.assignRota(2, ctx);
    const nextUpdate = Rota.getNextUpdateDateForRota(2) || job.nextInvocation();
    ctx.editMessageText(buildRotaSetSuccessMessage(2, nextUpdate), {
      parse_mode: 'HTML',
    });
    ctx.answerCbQuery(); // Acknowledge the callback query to remove the loading state
  });

  // Set rota 3
  bot.action('set_rota_3', async (ctx) => {
    await Redis.assignRota(3, ctx);
    const nextUpdate = Rota.getNextUpdateDateForRota(3) || job.nextInvocation();
    ctx.editMessageText(buildRotaSetSuccessMessage(3, nextUpdate), {
      parse_mode: 'HTML',
    });
    ctx.answerCbQuery(); // Acknowledge the callback query to remove the loading state
  });

  // Set OH
  bot.action('set_office_hours', async (ctx) => {
    await Redis.assignRota('office_hours', ctx);
    const nextUpdate = job.nextInvocation();
    ctx.editMessageText(
      buildRotaSetSuccessMessage('office_hours', nextUpdate),
      {
        parse_mode: 'HTML',
      },
    );
    ctx.answerCbQuery(); // Acknowledge the callback query to remove the loading state
  });

  // Stop updates
  bot.action('stop_updates', async (ctx) => {
    if (!ctx.chat) return;
    try {
      await Redis.removeChatFromAllSubscriptions(ctx.chat.id);
    } catch (err) {
      logger.error(`Failed to remove chat ID from subscriptions: ${err}`);
    }
    ctx.editMessageText(STOP_SUCCESS_MESSAGE);
    ctx.answerCbQuery(); // Acknowledge the callback query to remove the loading state
  });
}

// Registers all bot commands/actions against provided runtime instances.
// Injecting bot/job here keeps handler setup explicit and decoupled from module import.
function registerHandlers(bot: Telegraf, job: schedule.Job) {
  // ==============================
  // #region Bot command and action handlers
  // ==============================

  // Start
  bot.start(async (ctx) => {
    logger.info(
      `Start command called by Chat ID: ${ctx.chat.id}. Next update at ${new Date(job.nextInvocation()).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })}`,
    );

    const subscriptionRota = await Redis.getChatSubscriptionRota(ctx.chat.id);
    const rotaNumber: Rota.WorkingSchedule | null = subscriptionRota;
    const hasSubscribedToAnyChat = rotaNumber !== null;

    if (hasSubscribedToAnyChat) {
      const nextUpdateForSubscription =
        Rota.getNextUpdateDateForRota(rotaNumber) ??
        new Date(job.nextInvocation());

      const msg = buildAlreadySubscribedMessage(
        rotaNumber,
        nextUpdateForSubscription,
      );

      ctx.telegram.sendMessage(ctx.chat.id, msg, { parse_mode: 'HTML' });

      logger.info(
        'Chat ID: ' + ctx.chat.id + ' is already subscribed. No action taken.',
      );
      return;
    }

    ctx.telegram.sendMessage(ctx.chat.id, WELCOME_SUBSCRIBED_MESSAGE, {
      ...Markup.inlineKeyboard([
        Markup.button.callback('Rota 1', 'set_rota_1'),
        Markup.button.callback('Rota 2', 'set_rota_2'),
        Markup.button.callback('Rota 3', 'set_rota_3'),
        Markup.button.callback('Office Hours', 'set_office_hours'),
      ]),
      parse_mode: 'HTML',
    });

    logger.info('Added Chat ID: ' + ctx.chat.id + ' to subscribed chat IDs.');
  });

  // Weather command
  bot.command('weather', async (ctx) => {
    logger.info(
      'Weather command called by user: ' +
        ctx.from.username +
        ' (ID: ' +
        ctx.from.id +
        ') in chat ID: ' +
        ctx.chat.id,
    );

    const loadingMessage = await ctx.reply(LOADING_MESSAGE);

    await MessageQueue.sendWeatherMessages(bot, [ctx.chat.id], {
      jobDate: new Date(),
      editMessageId: loadingMessage.message_id,
    });

    logger.info(
      'Processed on-demand weather data for user: ' +
        ctx.from.username +
        ' (ID: ' +
        ctx.from.id +
        ') in chat ID: ' +
        ctx.chat.id,
    );
  });

  bot.command('catstatus', async (ctx) => {
    logger.info(
      'CAT status command called by user: ' +
        ctx.from.username +
        ' (ID: ' +
        ctx.from.id +
        ') in chat ID: ' +
        ctx.chat.id,
    );

    const loadingMessage = await ctx.reply(LOADING_MESSAGE);

    try {
      const promises = [
        CatStatus.API.getCatStatusFor('CDA'),
        CatStatus.API.getCatStatusFor('HTTC'),
      ];

      const [cdaCATStatus, httcCATStatus] = await Promise.all(promises);

      const [parsedCATStatusCDA, parsedCATStatusHTTC] = [
        CatStatus.parseCATStatus(
          new Date(cdaCATStatus.cat_start_on),
          cdaCATStatus.CAT,
        ),
        CatStatus.parseCATStatus(
          new Date(httcCATStatus.cat_start_on),
          httcCATStatus.CAT,
        ),
      ];

      const message = `📍 Civil Defence Academy
CAT Status: ${parsedCATStatusCDA.catText} ${parsedCATStatusCDA.emoji}
CAT Start On: ${CatStatus.formatDate(new Date(cdaCATStatus?.cat_start_on)) ?? 'N/A'}
CAT Ends On: ${CatStatus.formatDate(new Date(cdaCATStatus?.cat_end_on)) ?? 'N/A'}
    
📍 Home Team Tactical Centre
CAT Status: ${parsedCATStatusHTTC.catText} ${parsedCATStatusHTTC.emoji}
CAT Start On: ${CatStatus.formatDate(new Date(httcCATStatus?.cat_end_on)) ?? 'N/A'}
CAT Ends On: ${CatStatus.formatDate(new Date(httcCATStatus?.cat_end_on)) ?? 'N/A'}
    
Info last updated: ${CatStatus.formatDate(new Date(cdaCATStatus?.update_on)) ?? 'N/A'}
⚠️ All info is accurate as of the last updated time.
    
ℹ️ CAT Status Legend:
🟢 CAT 3: Outdoor activities are allowed.
🟡 CAT 2: Outdoor activities to be decided by conducting structure.
🟠 CAT 1 (Incoming): CAT 1 has been declared and will take effect at the stated time. Prepare to cease outdoor activities.
🔴 CAT 1: Heavy rain and/or lightning risk. Outdoor activities are NOT ALLOWED.`;

      ctx.telegram.editMessageText(
        ctx.chat.id,
        loadingMessage.message_id,
        undefined,
        message,
        {
          parse_mode: 'HTML',
        },
      );
    } catch (error) {
      console.log(error);

      const message = `There was an error getting the CAT Status. Please try again later.
      
      Error: ${error}`;

      ctx.telegram.editMessageText(
        ctx.chat.id,
        loadingMessage.message_id,
        undefined,
        message,
        {
          parse_mode: 'HTML',
        },
      );
    }
  });

  // Settings
  bot.command('settings', async (ctx) => {
    const rotaNumber = await Redis.getChatSubscriptionRota(ctx.chat.id);

    if (rotaNumber === null) {
      await ctx.telegram.sendMessage(
        ctx.chat.id,
        'You are not currently subscribed to any schedule. Use /start to subscribe.',
      );
      return;
    }

    ctx.telegram.sendMessage(ctx.chat.id, buildSettingsMessages(rotaNumber), {
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('Rota 1', 'set_rota_1'),
          Markup.button.callback('Rota 2', 'set_rota_2'),
          Markup.button.callback('Rota 3', 'set_rota_3'),
          Markup.button.callback('Office Hours', 'set_office_hours'),
        ],
        [Markup.button.callback('Stop Updates', 'stop_updates')],
      ]),
      parse_mode: 'HTML',
    });
  });

  bot.help((ctx) => {
    ctx.reply(HELP_MESSAGE, { parse_mode: 'HTML' });
  });
}

function registerAdminHandlers(bot: Telegraf, job: schedule.Job) {
  // Usage: /announcement [message]
  // Example: /announcement Weather update will be delayed today due to API issues.
  bot.command('announcement', async (ctx) => {
    if (ctx.from.id.toString() !== env.OWNER_USER_ID) {
      ctx.reply('You are not authorized to use this command.');
      return;
    }

    const announcement = ctx.message.text.split(' ').slice(1).join(' ');

    if (!announcement) {
      ctx.reply('Please provide a message for the announcement.');
      return;
    }

    const subscribedChatIds = await Redis.getAllChatIds();

    await MessageQueue.sendAnnouncementMessages(
      bot,
      subscribedChatIds.map((id) => parseInt(id, 10)),
      announcement,
    );

    ctx.reply('✅ Announcement sent to all subscribed chats.');
    ctx.reply('📢 Your announcement: ' + announcement);

    logger.info(
      `Admin announcement sent by user: ${ctx.from.username} (ID: ${ctx.from.id}). Message: ${announcement}`,
    );
  });
}

// ==============================
// #region Scheduled job to send weather updates
// ==============================
// Creates the scheduler job lazily so importing this module does not start background work.
function createJob(bot: Telegraf): schedule.Job {
  return schedule.scheduleJob(rule, async (fireDate) => {
    const jobDate = new Date(fireDate);
    const lockKey = Redis.getWeatherJobLockKey(jobDate);
    const lockValue = randomUUID();
    const lockTtlSeconds = 120;

    try {
      const lockAcquired = await Redis.acquireDistributedLock(
        lockKey,
        lockValue,
        lockTtlSeconds,
      );

      if (!lockAcquired) {
        logger.info(
          `Skipped weather send at ${jobDate.toISOString()} because scheduler lock is already held by another instance.`,
        );
        return;
      }

      const subscribedChatIds =
        await Redis.getSubscribedChatIdsForDate(jobDate);

      if (subscribedChatIds.length === 0) {
        logger.info('No subscribed chat IDs found. Skipping weather report.');
        return;
      }

      await MessageQueue.sendWeatherMessages(
        bot,
        subscribedChatIds.map((id) => parseInt(id, 10)),
        {
          jobDate,
        },
      );

      logger.info(
        'Sent weather reports to all subscribed chat IDs at ' +
          new Date().toLocaleString('en-SG', {
            timeZone: 'Asia/Singapore',
          }),
      );
    } catch (error) {
      logger.error('Error fetching weather data:', error);
    } finally {
      try {
        await Redis.releaseDistributedLock(lockKey, lockValue);
      } catch (error) {
        logger.error('Failed to release scheduler lock:', error);
      }
    }
  });
}

// Composition root for this module: builds bot + scheduler, wires handlers, and returns runtime.
// Caller controls when runtime starts by deciding when to invoke this function.
export function startBot(): BotRuntime {
  const bot = createBot();
  const job = createJob(bot);
  registerBotActionHandlers(bot, job);
  registerAdminHandlers(bot, job);
  registerHandlers(bot, job);
  return { bot, job };
}
