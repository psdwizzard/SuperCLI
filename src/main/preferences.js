const path = require('path');
const fs = require('fs');
const os = require('os');

function loadUserPreferences(projectPath) {
  const prefs = { version: 1, defaults: {}, language_prefs: {} };
  let homePrefs = null;
  try {
    if (projectPath) {
      const projectUserPath = path.join(projectPath, '.user');
      if (fs.existsSync(projectUserPath)) {
        const raw = fs.readFileSync(projectUserPath, 'utf8');
        Object.assign(prefs, JSON.parse(raw));
      }
    }
  } catch (e) {
    console.warn('Failed to parse project .user:', e.message);
  }

  try {
    const homeUserPath = path.join(os.homedir(), '.supercli.user');
    if (fs.existsSync(homeUserPath)) {
      const rawHome = fs.readFileSync(homeUserPath, 'utf8');
      homePrefs = JSON.parse(rawHome);
      for (const [k, v] of Object.entries(homePrefs)) {
        if (prefs[k] === undefined) prefs[k] = v;
      }
    }
  } catch (e) {
    console.warn('Failed to parse home .supercli.user:', e.message);
  }

  try {
    const homeToken = homePrefs?.integrations?.github?.token;
    if (homeToken) {
      if (!prefs.integrations) prefs.integrations = {};
      if (!prefs.integrations.github) prefs.integrations.github = {};
      if (!prefs.integrations.github.token) {
        prefs.integrations.github.token = homeToken;
      }
    }
  } catch (_) { /* noop */ }

  return prefs;
}

function saveUserPreferences(projectPath, preferences) {
  if (!projectPath) throw new Error('Missing projectPath');
  const targetPath = path.join(projectPath, '.user');

  let prefsObject = preferences;
  if (typeof prefsObject === 'string') {
    prefsObject = JSON.parse(prefsObject);
  }
  if (typeof prefsObject !== 'object' || prefsObject === null) {
    throw new Error('Preferences must be an object');
  }

  if (!prefsObject.version) {
    prefsObject.version = 1;
  }

  let wroteHomeToken = false;
  try {
    const ghToken = prefsObject?.integrations?.github?.token;
    if (ghToken) {
      const homeUserPath = path.join(os.homedir(), '.supercli.user');
      let homePrefs = {};
      if (fs.existsSync(homeUserPath)) {
        try {
          homePrefs = JSON.parse(fs.readFileSync(homeUserPath, 'utf8'));
        } catch (_) {
          homePrefs = {};
        }
      }
      if (!homePrefs.integrations) homePrefs.integrations = {};
      if (!homePrefs.integrations.github) homePrefs.integrations.github = {};
      homePrefs.integrations.github.token = ghToken;
      fs.writeFileSync(homeUserPath, JSON.stringify(homePrefs, null, 2), 'utf8');
      wroteHomeToken = true;
    }
  } catch (e) {
    console.warn('Failed to save GitHub token to home prefs:', e.message);
  }

  if (wroteHomeToken && prefsObject?.integrations?.github?.token) {
    delete prefsObject.integrations.github.token;
  }

  fs.writeFileSync(targetPath, JSON.stringify(prefsObject, null, 2), 'utf8');
  return { success: true, path: targetPath, prefsObject };
}

module.exports = {
  loadUserPreferences,
  saveUserPreferences
};
