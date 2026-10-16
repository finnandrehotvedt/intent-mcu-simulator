// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const path = require('path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = new URL(process.env.LAB_URL || 'https://lab.teachthecompany.com/');
const canonical = 'https://lab.teachthecompany.com/';
const expectedExternalLinks = [
  'https://github.com/finnandrehotvedt/intent-mcu-simulator',
  'https://finnandre.no/2026/10/06/intent-mcu-simulator-apen-kildekode/',
  'https://www.intentforce.no/intent-mcu-simulator-apen-kildekode/',
];
const documentation = [
  ['/controllers.html', 'Controller support | Intent MCU Simulator', 'ESP32-C3'],
  ['/components.html', 'Supported components | Intent MCU Simulator', '16 selectable'],
  ['/examples.html', 'Starter examples | Intent MCU Simulator', 'Temperature display'],
  ['/support.html', 'Help and limitations | Intent MCU Simulator', 'ownership with the learner'],
];
const expectedInternalLinks = documentation.map(([pathname]) => pathname)
  .map((pathname) => new URL(pathname, base).href);
const expectedLinks = [...expectedInternalLinks, ...expectedExternalLinks];

function assert(value, message) {
  if (!value) throw new Error(message);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const externalRequests = [];
  const consoleErrors = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== base.origin) externalRequests.push(request.url());
  });
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  const started = Date.now();
  const response = await page.goto(base.href, { waitUntil: 'networkidle' });
  const loadedMs = Date.now() - started;
  assert(response && response.status() === 200, 'root status');
  const robotHeader = response.headers()['x-robots-tag'];
  if (base.href === canonical) assert(robotHeader === 'index, follow', `X-Robots-Tag ${robotHeader}`);

  const metadata = await page.evaluate(() => {
    const content = (selector) => document.querySelector(selector)?.getAttribute('content') || '';
    const structured = [...document.querySelectorAll('script[type="application/ld+json"]')].map((node) => JSON.parse(node.textContent));
    const controls = [...document.querySelectorAll('button, input, select, textarea')]
      .filter((node) => node.type !== 'hidden')
      .filter((node) => {
        const label = node.id && document.querySelector(`label[for="${CSS.escape(node.id)}"]`);
        return !(node.getAttribute('aria-label') || node.getAttribute('aria-labelledby') || label || node.closest('label') || node.textContent.trim());
      })
      .map((node) => `${node.tagName.toLowerCase()}#${node.id}`);
    return {
      title: document.title,
      description: content('meta[name="description"]'),
      robots: content('meta[name="robots"]'),
      canonical: document.querySelector('link[rel="canonical"]')?.href,
      alternate: document.querySelector('link[rel="alternate"][type="text/plain"]')?.href,
      ogTitle: content('meta[property="og:title"]'),
      ogDescription: content('meta[property="og:description"]'),
      ogImage: content('meta[property="og:image"]'),
      twitterCard: content('meta[name="twitter:card"]'),
      headings: [...document.querySelectorAll('h1')].map((node) => node.textContent.trim()),
      questions: [...document.querySelectorAll('.answer-grid h3')].map((node) => node.textContent.trim()),
      links: [...document.querySelectorAll('.project-links a')].map((node) => node.href),
      structured,
      unnamedControls: controls,
      resources: performance.getEntriesByType('resource').map((entry) => ({ name: entry.name, transferSize: entry.transferSize })),
    };
  });
  assert(metadata.title === 'Intent MCU Simulator | Public AVR workbench and controller previews', 'title');
  assert(metadata.description.length >= 120 && metadata.description.length <= 170, 'description length');
  assert(metadata.robots.startsWith('index,follow'), 'meta robots');
  assert(metadata.canonical === canonical, `canonical ${metadata.canonical}`);
  assert(metadata.alternate === new URL('/llms.txt', base).href, 'llms alternate');
  assert(metadata.ogTitle === metadata.title && metadata.ogDescription.length > 90, 'Open Graph copy');
  assert(metadata.ogImage === `${canonical}social-card.png`, 'Open Graph image');
  assert(metadata.twitterCard === 'summary_large_image', 'Twitter card');
  assert(metadata.headings.length === 1 && metadata.headings[0] === 'Intent MCU Simulator', 'single product h1');
  assert(metadata.questions.length === 3, 'visible answer questions');
  assert(JSON.stringify(metadata.links) === JSON.stringify(expectedLinks), 'project links');
  assert(metadata.unnamedControls.length === 0, `unnamed controls ${metadata.unnamedControls.join(',')}`);
  const graph = metadata.structured.flatMap((value) => value['@graph'] || [value]);
  assert(graph.some((value) => value['@type'] === 'WebApplication' && value.codeRepository === expectedExternalLinks[0]), 'WebApplication schema');
  assert(graph.some((value) => value['@type'] === 'FAQPage' && value.mainEntity.length === 4), 'FAQ schema');

  for (const [pathname, type, phrase] of [
    ['/robots.txt', 'text/plain', 'Disallow: /api/'],
    ['/sitemap.xml', 'application/xml', canonical],
    ['/llms.txt', 'text/plain', 'no hosted AI API'],
    ['/social-card.png', 'image/png', null],
    ['/icon.svg', 'image/svg+xml', null],
    ...documentation.map(([pathname, , phrase]) => [pathname, 'text/html', phrase]),
  ]) {
    const item = await context.request.get(new URL(pathname, base).href);
    assert(item.status() === 200, `${pathname} status`);
    assert(item.headers()['content-type'].startsWith(type), `${pathname} type`);
    if (phrase) assert((await item.text()).includes(phrase), `${pathname} content`);
  }
  const documentationTitles = new Set();
  for (const [pathname, expectedTitle] of documentation) {
    const item = await context.request.get(new URL(pathname, base).href);
    const html = await item.text();
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    const canonicalHref = html.match(/<link rel="canonical" href="([^"]+)">/)?.[1];
    assert(title === expectedTitle, `${pathname} title ${title}`);
    assert(!documentationTitles.has(title), `${pathname} duplicate title`);
    documentationTitles.add(title);
    assert(canonicalHref === new URL(pathname, canonical).href, `${pathname} canonical ${canonicalHref}`);
    assert((html.match(/<h1(?:\s[^>]*)?>/g) ?? []).length === 1, `${pathname} h1 count`);
    assert(/<meta name="robots" content="index,follow/.test(html), `${pathname} robots`);
    assert(!/href="\/(?:api|evidence|private|candidate)(?:\/|\")/.test(html), `${pathname} private route link`);
  }
  const sitemap = await (await context.request.get(new URL('/sitemap.xml', base).href)).text();
  for (const pathname of ['/', ...documentation.map(([path]) => path)]) {
    assert(sitemap.includes(`<loc>${new URL(pathname, canonical).href}</loc>`), `sitemap ${pathname}`);
  }
  assert(!/<loc>[^<]+\/(?:api|evidence|private|candidate)(?:\/|<)/.test(sitemap), 'private route in sitemap');
  const controllers = await (await context.request.get(new URL('/controllers.html', base).href)).text();
  assert(controllers.includes('ATmega328P · 16 MHz · 5 V')
    && controllers.includes('Public preview only')
    && controllers.includes('actual QEMU UART/reset/watchdog evidence')
    && controllers.includes('actual Renode PB0/USART3/reset evidence')
    && controllers.includes('No public Build, arbitrary-ELF input'), 'controller page capability boundary');
  for (const link of expectedExternalLinks) {
    const item = await context.request.get(link, { maxRedirects: 5 });
    assert(item.status() >= 200 && item.status() < 400, `${link} status ${item.status()}`);
  }

  const widths = [];
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    assert(dimensions.scrollWidth <= dimensions.clientWidth + 1, `${width}px horizontal overflow`);
    widths.push({ width, ...dimensions });
  }

  const transferred = metadata.resources.reduce((sum, item) => sum + item.transferSize, 0);
  assert(loadedMs < 5000, `network-idle load ${loadedMs}ms`);
  assert(transferred < 650000, `initial transfer ${transferred} bytes`);
  assert(externalRequests.length === 0, `third-party page requests ${externalRequests.join(',')}`);
  assert(consoleErrors.length === 0, `console errors ${consoleErrors.join(' | ')}`);

  await browser.close();
  process.stdout.write(`${JSON.stringify({ status: 'pass', base: base.href, loadedMs, transferred, widths, metadata: {
    title: metadata.title,
    descriptionLength: metadata.description.length,
    schemas: graph.map((value) => value['@type']),
    projectLinks: metadata.links.length,
    questions: metadata.questions.length,
  } })}\n`);
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exit(1);
});
