const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { takeAllScreenshots } = require('./screenshot');

const WEBSITES_FILE = path.join(__dirname, '..', 'data', 'websites.json');
const SCHEDULE_FILE = path.join(__dirname, '..', 'data', 'schedule.json');

let activeTasks = [];

function loadWebsites() {
  try {
    const data = fs.readFileSync(WEBSITES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading websites:', error.message);
    return [];
  }
}

function loadSchedule() {
  try {
    const data = fs.readFileSync(SCHEDULE_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

function saveSchedule(schedule) {
  const dir = path.dirname(SCHEDULE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(schedule, null, 2));
}

function stopAllTasks() {
  activeTasks.forEach(task => task.stop());
  activeTasks = [];
}

function runScreenshotJob() {
  console.log('Scheduled task triggered:', new Date().toISOString());
  const websites = loadWebsites();

  if (websites.length === 0) {
    console.log('No websites configured. Skipping screenshot job.');
    return;
  }

  takeAllScreenshots(websites);
}

function startScheduler() {
  stopAllTasks();

  const schedule = loadSchedule();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const entries = Object.entries(schedule);

  if (entries.length === 0) {
    console.log('No schedule configured. Scheduler inactive.');
    return;
  }

  entries.forEach(([day, time]) => {
    const [hour, minute] = time.split(':');
    const cronExpression = `${minute} ${hour} * * ${day}`;

    if (cron.validate(cronExpression)) {
      const task = cron.schedule(cronExpression, runScreenshotJob);
      activeTasks.push(task);
      console.log(`Scheduled: ${dayNames[day]} at ${time}`);
    }
  });

  console.log(`Scheduler started with ${activeTasks.length} job(s)`);
}

module.exports = { startScheduler, loadSchedule, saveSchedule, loadWebsites };
