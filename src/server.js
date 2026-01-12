const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { takeAllScreenshots, SCREENSHOTS_DIR } = require('./screenshot');
const { loadSchedule, saveSchedule, startScheduler } = require('./scheduler');

const WEBSITES_FILE = path.join(__dirname, '..', 'data', 'websites.json');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Simple password protection
const APP_PASSWORD = process.env.APP_PASSWORD || 'changeme';
const activeSessions = new Set();

function loadWebsites() {
  try {
    const data = fs.readFileSync(WEBSITES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

function saveWebsites(websites) {
  const dir = path.dirname(WEBSITES_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(WEBSITES_FILE, JSON.stringify(websites, null, 2));
}

// Authentication middleware
function requireAuth(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (token && activeSessions.has(token)) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

function createServer() {
  const app = express();

  // Log all requests for debugging
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });

  app.use(express.json());

  // Login endpoint (unprotected)
  app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password === APP_PASSWORD) {
      const token = crypto.randomBytes(32).toString('hex');
      activeSessions.add(token);
      res.json({ success: true, token });
    } else {
      res.status(401).json({ error: 'Invalid password' });
    }
  });

  // Check auth status
  app.get('/api/auth', (req, res) => {
    const token = req.headers['x-auth-token'];
    if (token && activeSessions.has(token)) {
      res.json({ authenticated: true });
    } else {
      res.json({ authenticated: false });
    }
  });

  // Logout endpoint
  app.post('/api/logout', (req, res) => {
    const token = req.headers['x-auth-token'];
    if (token) {
      activeSessions.delete(token);
    }
    res.json({ success: true });
  });

  // Static files
  app.use(express.static(PUBLIC_DIR));
  app.use('/screenshots', express.static(SCREENSHOTS_DIR));

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Get all websites
  app.get('/api/websites', requireAuth, (req, res) => {
    const websites = loadWebsites();
    res.json(websites);
  });

  // Add a website
  app.post('/api/websites', requireAuth, (req, res) => {
    try {
      const { url } = req.body;

      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'URL is required' });
      }

      const trimmedUrl = url.trim();
      if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
        return res.status(400).json({ error: 'URL must start with http:// or https://' });
      }

      const websites = loadWebsites();

      if (websites.includes(trimmedUrl)) {
        return res.status(409).json({ error: 'Website already exists' });
      }

      websites.push(trimmedUrl);
      saveWebsites(websites);

      res.status(201).json({ message: 'Website added', websites });
    } catch (error) {
      console.error('Error adding website:', error);
      res.status(500).json({ error: 'Failed to save website: ' + error.message });
    }
  });

  // Delete a website
  app.delete('/api/websites', requireAuth, (req, res) => {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    let websites = loadWebsites();
    const initialLength = websites.length;
    websites = websites.filter(w => w !== url);

    if (websites.length === initialLength) {
      return res.status(404).json({ error: 'Website not found' });
    }

    saveWebsites(websites);
    res.json({ message: 'Website removed', websites });
  });

  // Get screenshots for a website
  app.get('/api/screenshots/:folder', requireAuth, (req, res) => {
    const folderName = req.params.folder;
    const folderPath = path.join(SCREENSHOTS_DIR, folderName);

    try {
      if (!fs.existsSync(folderPath)) {
        return res.json([]);
      }

      const files = fs.readdirSync(folderPath)
        .filter(f => f.endsWith('.png'))
        .sort((a, b) => b.localeCompare(a)); // newest first

      const screenshots = files.map(file => ({
        filename: file,
        url: `/screenshots/${folderName}/${file}`
      }));

      res.json(screenshots);
    } catch (error) {
      console.error('Error listing screenshots:', error);
      res.status(500).json({ error: 'Failed to list screenshots' });
    }
  });

  // Trigger manual screenshot run
  app.post('/api/screenshots/run', requireAuth, async (req, res) => {
    const websites = loadWebsites();

    if (websites.length === 0) {
      return res.status(400).json({ error: 'No websites configured' });
    }

    res.json({ message: 'Screenshot job started', count: websites.length });

    // Run screenshots in background
    takeAllScreenshots(websites);
  });

  // Get schedule
  app.get('/api/schedule', requireAuth, (req, res) => {
    const schedule = loadSchedule();
    res.json(schedule);
  });

  // Update schedule
  app.post('/api/schedule', requireAuth, (req, res) => {
    try {
      const schedule = req.body;

      if (typeof schedule !== 'object' || Array.isArray(schedule)) {
        return res.status(400).json({ error: 'Schedule must be an object' });
      }

      // Validate: keys must be 0-6, values must be valid times
      const validSchedule = {};
      for (const [day, time] of Object.entries(schedule)) {
        const dayNum = parseInt(day);
        if (dayNum >= 0 && dayNum <= 6 && /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
          validSchedule[dayNum] = time;
        }
      }

      saveSchedule(validSchedule);
      startScheduler();

      res.json({ message: 'Schedule updated', schedule: validSchedule });
    } catch (error) {
      console.error('Error updating schedule:', error);
      res.status(500).json({ error: 'Failed to update schedule' });
    }
  });

  // Global error handler
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error: ' + err.message });
  });

  return app;
}

module.exports = { createServer };
