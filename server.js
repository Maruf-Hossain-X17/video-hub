require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Serve static files from the current directory
app.use(express.static(__dirname));

// Environment Variables
const PORT = process.env.PORT || 3000;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_SHEETS_API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASS = process.env.ADMIN_PASS;
const MUSIC_API_BASE_URL = process.env.MUSIC_API_BASE_URL;
const APK_DOWNLOAD_LINK = process.env.APK_DOWNLOAD_LINK;

// Helper function for Google Sheets instance
function getSheetsInstance() {
  return google.sheets({
    version: 'v4',
    auth: GOOGLE_SHEETS_API_KEY,
  });
}

// Public Config route for non-sensitive public links
app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    apkLink: APK_DOWNLOAD_LINK,
    musicApi: {
      search: `${MUSIC_API_BASE_URL}/search`,
      download: `${MUSIC_API_BASE_URL}/play`
    }
  });
});

// Fetch data from a specific sheet
app.get('/api/data/:sheetName', async (req, res) => {
  const { sheetName } = req.params;
  try {
    const sheets = getSheetsInstance();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${sheetName}!A:Z`,
    });
    
    const rows = response.data.values;
    if (!rows || rows.length <= 1) {
      return res.status(200).json({ success: true, data: [] });
    }

    const headers = rows[0].map(h => h.toLowerCase());
    const data = rows.slice(1).map(row => {
      const rowObject = {};
      headers.forEach((header, index) => {
        rowObject[header] = row[index] || '';
      });
      return rowObject;
    });

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error(`API Error for sheet ${sheetName}:`, error.message);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// Auth Route: Login (User & Admin)
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }

  // Check Admin Login securely on server side
  if (email === ADMIN_EMAIL && password === ADMIN_PASS) {
    return res.status(200).json({
      success: true,
      isAdmin: true,
      message: 'Admin login successful!'
    });
  }

  try {
    const sheets = getSheetsInstance();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: 'users!A:Z', 
    });
    
    const rows = response.data.values;
    if (!rows || rows.length <= 1) {
      return res.status(404).json({ success: false, message: 'User data not found.' });
    }

    const headers = rows[0].map(h => h.toLowerCase());
    const users = rows.slice(1).map(row => {
      const user = {};
      headers.forEach((header, index) => {
        user[header] = row[index] || '';
      });
      return user;
    });
    
    const user = users.find(u => u.email === email && u.password === password);
    
    if (user) {
      if (user.status === 'blocked') {
        return res.status(403).json({ success: false, message: 'Your account has been blocked by admin.' });
      }
      res.status(200).json({
        success: true,
        isAdmin: false,
        message: 'Login successful!',
        user: { id: user.id, name: user.name, email: user.email, status: user.status }
      });
    } else {
      res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }
  } catch (error) {
    console.error('API Login Error:', error.message);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// Append Data (Upload Videos, Requests, Reports, Users)
app.post('/api/append/:sheetName', async (req, res) => {
  const { sheetName } = req.params;
  const rowData = req.body;

  if (!rowData || typeof rowData !== 'object') {
    return res.status(400).json({ success: false, message: 'Invalid data format.' });
  }

  try {
    const sheets = getSheetsInstance();
    const newRow = Object.values(rowData);

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${sheetName}!A:Z`,
      valueInputOption: 'RAW',
      resource: { values: [newRow] },
    });

    res.status(200).json({ success: true, message: 'Data saved successfully!', data: response.data });
  } catch (error) {
    console.error(`Append Error on ${sheetName}:`, error.message);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// Serve frontend SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
