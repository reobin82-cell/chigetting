const fs = require('fs');
const path = require('path');

function ensureStateFile(filePath) {
  const fullPath = path.resolve(filePath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(fullPath)) {
    fs.writeFileSync(
      fullPath,
      JSON.stringify({ alerts: [], devices: [], sentKeys: {}, lastRunAt: null, lastError: null }, null, 2),
      'utf8'
    );
  }
  return fullPath;
}

function readState(filePath) {
  const fullPath = ensureStateFile(filePath);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function writeState(filePath, state) {
  const fullPath = ensureStateFile(filePath);
  fs.writeFileSync(fullPath, JSON.stringify(state, null, 2), 'utf8');
}

module.exports = {
  ensureStateFile,
  readState,
  writeState
};
