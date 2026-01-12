const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = path.join(__dirname, '..', 'screenshots');

function sanitizeFolderName(url) {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function takeScreenshot(url) {
  const folderName = sanitizeFolderName(url);
  const folderPath = path.join(SCREENSHOTS_DIR, folderName);

  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  const timestamp = getTimestamp();
  const filename = `screenshot_${timestamp}.png`;
  const filepath = path.join(folderPath, filename);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 6000 });
    await page.screenshot({ path: filepath, fullPage: false });

    console.log(`Screenshot saved: ${filepath}`);
    return { success: true, url, filepath };
  } catch (error) {
    console.error(`Failed to screenshot ${url}:`, error.message);
    return { success: false, url, error: error.message };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function takeAllScreenshots(websites) {
  console.log(`Taking screenshots of ${websites.length} website(s)...`);
  const results = [];

  for (const url of websites) {
    const result = await takeScreenshot(url);
    results.push(result);
  }

  const successful = results.filter(r => r.success).length;
  console.log(`Completed: ${successful}/${websites.length} screenshots taken successfully`);

  return results;
}

module.exports = { takeScreenshot, takeAllScreenshots, SCREENSHOTS_DIR };
