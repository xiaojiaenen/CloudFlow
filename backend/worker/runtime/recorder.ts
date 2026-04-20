import { BrowserContext, Page } from 'playwright';

export type RecorderReplayAction = {
  type: 'open_page' | 'click' | 'input' | 'press_key' | 'scroll' | 'wait_for_url';
  selector?: string;
  value?: string;
  url?: string;
  key?: string;
  direction?: 'up' | 'down' | 'top' | 'bottom';
  distance?: number;
};

type AcquireBrowser = () => Promise<{
  newContext: (options: {
    viewport: { width: number; height: number };
    acceptDownloads: boolean;
  }) => Promise<BrowserContext>;
}>;

export function createRecorderBrowserPool(
  acquireBrowser: AcquireBrowser,
  options: {
    maxIdlePages?: number;
    viewport?: { width: number; height: number };
  } = {},
) {
  const maxIdlePages = Math.max(1, options.maxIdlePages ?? 2);
  const viewport = options.viewport ?? { width: 1440, height: 900 };
  const idleEntries: Array<{ context: BrowserContext; page: Page }> = [];

  async function createLease() {
    const browser = await acquireBrowser();
    const context = await browser.newContext({
      viewport,
      acceptDownloads: false,
    });
    const page = await context.newPage();

    return { context, page };
  }

  async function acquire() {
    const idleEntry = idleEntries.pop();

    if (idleEntry && !idleEntry.page.isClosed()) {
      return idleEntry;
    }

    if (idleEntry) {
      await idleEntry.context.close().catch(() => undefined);
    }

    return createLease();
  }

  async function release(context: BrowserContext, page: Page) {
    if (page.isClosed()) {
      await context.close().catch(() => undefined);
      return;
    }

    try {
      await context.clearCookies().catch(() => undefined);
      await page.goto('about:blank', {
        waitUntil: 'domcontentloaded',
        timeout: 5_000,
      }).catch(() => undefined);
    } catch {
      await context.close().catch(() => undefined);
      return;
    }

    if (idleEntries.length >= maxIdlePages) {
      await context.close().catch(() => undefined);
      return;
    }

    idleEntries.push({ context, page });
  }

  async function drain() {
    while (idleEntries.length > 0) {
      const entry = idleEntries.pop();

      if (!entry) {
        continue;
      }

      await entry.context.close().catch(() => undefined);
    }
  }

  return {
    acquire,
    release,
    drain,
  };
}

export async function replayRecorderActionsOnPage(
  page: Page,
  actions: RecorderReplayAction[],
) {
  for (const action of actions) {
    if (action.type === 'open_page' && action.url) {
      await page.goto(action.url, {
        waitUntil: 'load',
        timeout: 30_000,
      }).catch(async () => {
        await page.goto(action.url ?? 'about:blank', {
          waitUntil: 'domcontentloaded',
          timeout: 30_000,
        });
      });
      continue;
    }

    if (action.type === 'click' && action.selector) {
      await page.locator(action.selector).first().click({ timeout: 5_000 });
      continue;
    }

    if (action.type === 'input' && action.selector) {
      await page.locator(action.selector).first().fill(action.value ?? '', {
        timeout: 5_000,
      });
      continue;
    }

    if (action.type === 'press_key' && action.key) {
      await page.keyboard.press(action.key);
      continue;
    }

    if (action.type === 'scroll') {
      if (action.direction === 'top' || action.direction === 'bottom') {
        await page.evaluate((nextDirection) => {
          window.scrollTo({
            top: nextDirection === 'top' ? 0 : document.body.scrollHeight,
            behavior: 'instant',
          });
        }, action.direction);
      } else {
        await page.mouse.wheel(
          0,
          action.direction === 'down'
            ? action.distance ?? 500
            : -(action.distance ?? 500),
        );
      }
      continue;
    }

    if (action.type === 'wait_for_url') {
      if (action.url?.trim()) {
        await page
          .waitForURL((url) => url.toString().includes(action.url ?? ''), {
            timeout: 10_000,
          })
          .catch(() => undefined);
      }
      await page.waitForLoadState('load', { timeout: 10_000 }).catch(() => undefined);
    }
  }
}
