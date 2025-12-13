#!/usr/bin/env node
/**
 * Downloads OpenCV.js to the public folder if it doesn't exist.
 * This script runs automatically after npm install.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const OPENCV_VERSION = '4.9.0';
const OPENCV_URL = `https://docs.opencv.org/${OPENCV_VERSION}/opencv.js`;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const OPENCV_PATH = path.join(PUBLIC_DIR, 'opencv.js');

async function downloadOpenCV() {
  // Check if already exists
  if (fs.existsSync(OPENCV_PATH)) {
    const stats = fs.statSync(OPENCV_PATH);
    if (stats.size > 1000000) { // At least 1MB means it's probably valid
      console.log('✓ OpenCV.js already exists in public folder');
      return;
    }
  }

  // Ensure public directory exists
  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }

  console.log(`Downloading OpenCV.js v${OPENCV_VERSION}...`);
  console.log(`  From: ${OPENCV_URL}`);
  console.log(`  To: ${OPENCV_PATH}`);

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(OPENCV_PATH);

    https.get(OPENCV_URL, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Handle redirect
        https.get(response.headers.location, (redirectResponse) => {
          redirectResponse.pipe(file);
          file.on('finish', () => {
            file.close();
            const stats = fs.statSync(OPENCV_PATH);
            console.log(`✓ Downloaded OpenCV.js (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
            resolve();
          });
        }).on('error', (err) => {
          fs.unlink(OPENCV_PATH, () => {});
          reject(err);
        });
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        const stats = fs.statSync(OPENCV_PATH);
        console.log(`✓ Downloaded OpenCV.js (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(OPENCV_PATH, () => {});
      reject(err);
    });
  });
}

downloadOpenCV().catch((err) => {
  console.error('Failed to download OpenCV.js:', err.message);
  console.error('Grain detection will not work without this file.');
  console.error(`You can manually download it from: ${OPENCV_URL}`);
  // Don't fail the install - grain detection just won't work
  process.exit(0);
});
