import { existsSync, readdirSync } from 'fs';
import os from 'os';
import path from 'path';
import { Browser, chromium } from 'playwright';

let browserPromise: Promise<Browser> | null = null;

const DEFAULT_PLAYWRIGHT_BROWSER_ROOTS = [
  '/ms-playwright',
  path.join(os.homedir(), '.cache', 'ms-playwright'),
];

export async function getBrowser() {
  if (!browserPromise) {
    const headless = process.env.BROWSER_HEADLESS !== 'false';
    const executablePath = resolveChromiumExecutablePath();
    console.log(
      `[worker] Launching Chromium (headless=${headless}) using ${
        executablePath ?? 'Playwright default resolution'
      }`,
    );
    browserPromise = chromium.launch({
      headless,
      ...(executablePath ? { executablePath } : {}),
    });
  }

  return browserPromise;
}

export async function closeBrowser() {
  if (!browserPromise) {
    return;
  }

  const browser = await browserPromise;
  browserPromise = null;
  await browser.close();
}

function resolveChromiumExecutablePath() {
  const explicitPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim();
  if (explicitPath) {
    return explicitPath;
  }

  const browserRoots = Array.from(
    new Set(
      [process.env.PLAYWRIGHT_BROWSERS_PATH, ...DEFAULT_PLAYWRIGHT_BROWSER_ROOTS].filter(
        (value): value is string => Boolean(value?.trim()),
      ),
    ),
  );

  const preferredCandidates = [
    {
      directoryPrefix: 'chromium-',
      executableSegments: ['chrome-linux64', 'chrome'],
    },
    {
      directoryPrefix: 'chromium_headless_shell-',
      executableSegments: [
        'chrome-headless-shell-linux64',
        'chrome-headless-shell',
      ],
    },
  ];

  for (const browserRoot of browserRoots) {
    for (const candidate of preferredCandidates) {
      const executablePath = findBrowserExecutable(
        browserRoot,
        candidate.directoryPrefix,
        candidate.executableSegments,
      );

      if (executablePath) {
        return executablePath;
      }
    }
  }

  return undefined;
}

function findBrowserExecutable(
  browserRoot: string,
  directoryPrefix: string,
  executableSegments: string[],
) {
  if (!existsSync(browserRoot)) {
    return undefined;
  }

  const candidateDirectories = readdirSync(browserRoot, {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(directoryPrefix))
    .sort((left, right) => right.name.localeCompare(left.name));

  for (const directory of candidateDirectories) {
    const executablePath = path.join(
      browserRoot,
      directory.name,
      ...executableSegments,
    );

    if (existsSync(executablePath)) {
      return executablePath;
    }
  }

  return undefined;
}
