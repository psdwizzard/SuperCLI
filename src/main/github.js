const path = require('path');
const fs = require('fs');
const https = require('https');
const { loadUserPreferences } = require('./preferences');

function resolveGitConfigPath(projectPath) {
  const dotGit = path.join(projectPath, '.git');
  if (!fs.existsSync(dotGit)) return null;
  try {
    const stat = fs.statSync(dotGit);
    if (stat.isDirectory()) {
      const cfg = path.join(dotGit, 'config');
      return fs.existsSync(cfg) ? cfg : null;
    }
    if (stat.isFile()) {
      const raw = fs.readFileSync(dotGit, 'utf8');
      const match = raw.match(/gitdir:\s*(.+)/i);
      if (!match) return null;
      const gitDir = match[1].trim();
      const resolved = path.resolve(projectPath, gitDir);
      const cfg = path.join(resolved, 'config');
      return fs.existsSync(cfg) ? cfg : null;
    }
  } catch (_) {
    return null;
  }
  return null;
}

function parseGithubRepoFromUrl(url) {
  if (!url) return null;
  const trimmed = String(url).trim();
  let match = trimmed.match(/github\.com[:/](.+?)(\.git)?$/i);
  if (!match) return null;
  const pathPart = match[1].replace(/^\/+/, '');
  const pieces = pathPart.split('/');
  if (pieces.length < 2) return null;
  const owner = pieces[0];
  const repo = pieces[1];
  if (!owner || !repo) return null;
  return { owner, repo };
}

function detectGithubRepo(projectPath) {
  const configPath = resolveGitConfigPath(projectPath);
  if (!configPath) return null;
  const raw = fs.readFileSync(configPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const remotes = {};
  let currentRemote = null;
  for (const line of lines) {
    const header = line.match(/^\s*\[remote\s+\"(.+?)\"\]\s*$/i);
    if (header) {
      currentRemote = header[1];
      remotes[currentRemote] = remotes[currentRemote] || {};
      continue;
    }
    const urlMatch = line.match(/^\s*url\s*=\s*(.+)\s*$/i);
    if (urlMatch && currentRemote) {
      remotes[currentRemote].url = urlMatch[1].trim();
    }
  }

  const originUrl = remotes.origin?.url;
  if (originUrl) {
    const repo = parseGithubRepoFromUrl(originUrl);
    if (repo) return repo;
  }
  for (const remote of Object.values(remotes)) {
    const repo = parseGithubRepoFromUrl(remote.url);
    if (repo) return repo;
  }
  return null;
}

function githubApiRequest(method, apiPath, token, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.github.com',
      path: apiPath,
      method,
      headers: {
        'User-Agent': 'SuperCLI',
        'Accept': 'application/vnd.github+json'
      }
    };
    if (token) options.headers.Authorization = `Bearer ${token}`;
    if (payload) {
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        if (data) {
          try { json = JSON.parse(data); } catch (_) { json = null; }
        }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function fetchIssues(projectPath, options = {}) {
  if (!projectPath) throw new Error('Missing projectPath');
  const repo = detectGithubRepo(projectPath);
  if (!repo) throw new Error('Unable to detect GitHub repo from .git/config');

  const prefs = loadUserPreferences(projectPath);
  const gh = prefs?.integrations?.github || {};
  const token = gh.token || '';
  const state = options.state || gh.issue_state || 'open';
  const labels = options.labels || gh.labels || '';

  const params = new URLSearchParams({ state, per_page: '100' });
  if (labels) params.append('labels', labels);
  const apiPath = `/repos/${repo.owner}/${repo.repo}/issues?${params.toString()}`;
  const res = await githubApiRequest('GET', apiPath, token, null);

  if (!res || res.status < 200 || res.status >= 300) {
    const msg = res?.json?.message || `GitHub API error (${res?.status || 'unknown'})`;
    throw new Error(msg);
  }

  const issues = Array.isArray(res.json) ? res.json : [];
  const filtered = issues.filter(i => !i.pull_request).map(i => ({
    id: i.id,
    number: i.number,
    title: i.title,
    state: i.state,
    html_url: i.html_url,
    labels: Array.isArray(i.labels) ? i.labels.map(l => l.name).filter(Boolean) : []
  }));

  return { repo, issues: filtered };
}

async function setIssueState(projectPath, issueNumber, newState, comment) {
  if (!projectPath) throw new Error('Missing projectPath');
  if (!issueNumber) throw new Error('Missing issue number');
  const repo = detectGithubRepo(projectPath);
  if (!repo) throw new Error('Unable to detect GitHub repo from .git/config');

  const prefs = loadUserPreferences(projectPath);
  const gh = prefs?.integrations?.github || {};
  const token = gh.token || '';
  if (!token) throw new Error('Missing GitHub token');

  const desiredState = newState === 'closed' ? 'closed' : 'open';
  const updatePath = `/repos/${repo.owner}/${repo.repo}/issues/${issueNumber}`;
  const updateRes = await githubApiRequest('PATCH', updatePath, token, { state: desiredState });
  if (!updateRes || updateRes.status < 200 || updateRes.status >= 300) {
    const msg = updateRes?.json?.message || `GitHub API error (${updateRes?.status || 'unknown'})`;
    throw new Error(msg);
  }

  if (comment && String(comment).trim()) {
    const commentPath = `/repos/${repo.owner}/${repo.repo}/issues/${issueNumber}/comments`;
    await githubApiRequest('POST', commentPath, token, { body: String(comment).trim() });
  }
}

module.exports = {
  resolveGitConfigPath,
  parseGithubRepoFromUrl,
  detectGithubRepo,
  githubApiRequest,
  fetchIssues,
  setIssueState
};
