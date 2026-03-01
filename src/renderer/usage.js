const state = require('./state');
const api = require('./api');

const CLI_COLORS = {
  claude: { bg: '#d4956a', text: '#1e1e1e' },
  codex: { bg: '#5b9bd5', text: '#1e1e1e' },
  gemini: { bg: '#a87bd6', text: '#1e1e1e' },
  aider: { bg: '#6bc96b', text: '#1e1e1e' },
  other: { bg: '#888888', text: '#1e1e1e' }
};

let badgesContainer = null;
let detailPopup = null;
let fetching = false;
let statusClearTimer = null;
const AUTO_REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes
let autoRefreshTimer = null;

function init() {
  badgesContainer = document.getElementById('usageBadges');
  renderBadges();
  // Auto-fetch quotas on launch after a short delay (let UI settle)
  setTimeout(() => {
    fetchAllQuotas({ source: 'startup' });
  }, 1200);
}

function scheduleAutoRefresh() {
  if (autoRefreshTimer) clearTimeout(autoRefreshTimer);
  autoRefreshTimer = setTimeout(() => {
    fetchAllQuotas({ source: 'auto' });
  }, AUTO_REFRESH_INTERVAL);
}

function normalizeCliType(cliCommand) {
  if (!cliCommand) return 'other';
  const cmd = String(cliCommand).toLowerCase().trim();
  if (cmd.includes('claude')) return 'claude';
  if (cmd.includes('codex')) return 'codex';
  if (cmd.includes('gemini')) return 'gemini';
  if (cmd.includes('aider')) return 'aider';
  return 'other';
}

function setUsageStatus(message, color = '#858585') {
  const info = document.getElementById('inputInfo');
  if (!info) return;
  info.textContent = message;
  info.style.color = color;
  if (statusClearTimer) clearTimeout(statusClearTimer);
  if (message) {
    statusClearTimer = setTimeout(() => {
      if (info.textContent === message) {
        info.textContent = '';
        info.style.color = '#858585';
      }
    }, 4000);
  }
}

function recordUsage(cliCommand, charCount) {
  const type = normalizeCliType(cliCommand);
  const stats = state.usageStats;
  if (!stats.has(type)) {
    stats.set(type, { messages: 0, chars: 0 });
  }
  const entry = stats.get(type);
  entry.messages += 1;
  entry.chars += charCount || 0;
  renderBadges();
}

// --- Quota Fetching ---

async function fetchAllQuotas(options = {}) {
  if (fetching) return;
  fetching = true;
  const source = options.source || 'manual';
  const refreshBtn = document.getElementById('usageRefreshBtn');
  if (refreshBtn && source !== 'auto') refreshBtn.classList.add('spinning');
  setUsageStatus('Fetching usage quota...', '#dcdcaa');

  await Promise.allSettled([
    fetchClaudeQuota(),
    fetchCodexQuota()
  ]);
  state.quotaData.lastFetch = new Date();
  fetching = false;
  if (refreshBtn) refreshBtn.classList.remove('spinning');

  // Show result summary in inputInfo
  const errors = [];
  const successes = [];
  for (const type of ['claude', 'codex']) {
    const q = state.quotaData[type];
    if (!q) continue;
    if (q.error) {
      errors.push(type);
    } else if (q.fiveHourRemaining !== null || q.weeklyRemaining !== null) {
      const pct = q.fiveHourRemaining ?? q.weeklyRemaining;
      successes.push(`${type}: ${pct}%`);
    }
  }

  if (successes.length > 0) {
    setUsageStatus('Quota: ' + successes.join(' · '), '#4ec9b0');
  } else if (errors.length > 0) {
    setUsageStatus('Quota fetch failed for ' + errors.join(', '), '#f48771');
  } else {
    setUsageStatus('No quota data available', '#858585');
  }

  // Auto-open login for providers that need it (only on manual refresh, not auto)
  const claudeData = state.quotaData.claude;
  if (claudeData && claudeData.needsLogin) {
    setUsageStatus('Claude: not logged in — click badge to login', '#f9c97a');
  }
  const codexData = state.quotaData.codex;
  if (codexData && codexData.needsLogin) {
    setUsageStatus('Codex: not logged in — click badge to login', '#f9c97a');
  }

  // Reset auto-refresh timer so it's always 10min from last fetch
  scheduleAutoRefresh();

  renderBadges();
}

async function fetchClaudeQuota() {
  try {
    const result = await api.fetchClaudeQuota();
    if (result.success && result.data) {
      state.quotaData.claude = {
        fiveHourRemaining: result.data.fiveHourRemaining,
        weeklyRemaining: result.data.weeklyRemaining,
        error: null
      };
    } else {
      state.quotaData.claude = {
        error: result.error || 'Failed to fetch',
        fiveHourRemaining: null,
        weeklyRemaining: null,
        needsLogin: (result.error || '').includes('Not logged in')
      };
    }
  } catch (err) {
    state.quotaData.claude = { error: err.message, fiveHourRemaining: null, weeklyRemaining: null };
  }
}

async function fetchCodexQuota() {
  try {
    const result = await api.fetchCodexQuota();
    if (result.success && result.data) {
      state.quotaData.codex = {
        weeklyRemaining: result.data.weeklyRemaining,
        fiveHourRemaining: result.data.fiveHourRemaining,
        error: null
      };
    } else {
      state.quotaData.codex = {
        error: result.error || 'Failed to fetch',
        weeklyRemaining: null,
        fiveHourRemaining: null,
        needsLogin: (result.error || '').includes('Not logged in')
      };
    }
  } catch (err) {
    state.quotaData.codex = { error: err.message, weeklyRemaining: null, fiveHourRemaining: null };
  }
}

// --- Rendering ---

function renderBadges() {
  if (!badgesContainer) return;
  badgesContainer.innerHTML = '';

  const stats = state.usageStats;
  const quota = state.quotaData;

  // Session usage badges
  for (const [type, data] of stats) {
    const colors = CLI_COLORS[type] || CLI_COLORS.other;
    const badge = document.createElement('button');
    badge.className = 'usage-badge';
    badge.style.backgroundColor = colors.bg;
    badge.style.color = colors.text;

    // Show quota remaining if available, error indicator, or message count
    const q = quota[type];
    if (q && !q.error && q.fiveHourRemaining !== null) {
      badge.textContent = `${type} ${q.fiveHourRemaining}%`;
      badge.title = `${type}: ${q.fiveHourRemaining}% remaining (5hr)`;
    } else if (q && q.error) {
      badge.textContent = `${type} ${data.messages}`;
      badge.title = `${type}: ${data.messages} msgs — quota error: ${q.error}`;
      badge.style.opacity = '0.7';
    } else {
      badge.textContent = `${type} ${data.messages}`;
      badge.title = `${type}: ${data.messages} msgs, ${formatChars(data.chars)} chars`;
    }

    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      showDetailPopup(e.currentTarget);
    });
    badgesContainer.appendChild(badge);
  }

  // Show quota-only badges for providers we have quota data for but no session usage
  for (const type of ['claude', 'codex']) {
    if (stats.has(type)) continue;
    const q = quota[type];
    if (!q) continue;
    const colors = CLI_COLORS[type] || CLI_COLORS.other;
    const badge = document.createElement('button');
    badge.className = 'usage-badge';

    if (q.error) {
      // Show dimmed error badge
      badge.style.backgroundColor = colors.bg;
      badge.style.color = colors.text;
      badge.style.opacity = '0.5';
      badge.textContent = `${type} ?`;
      badge.title = `${type}: ${q.error}`;
    } else {
      badge.style.backgroundColor = colors.bg;
      badge.style.color = colors.text;
      badge.textContent = q.fiveHourRemaining !== null ? `${type} ${q.fiveHourRemaining}%` : type;
      badge.title = `${type} quota`;
    }

    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      showDetailPopup(e.currentTarget);
    });
    badgesContainer.appendChild(badge);
  }

  // Refresh button
  let refreshBtn = document.getElementById('usageRefreshBtn');
  if (!refreshBtn) {
    refreshBtn = document.createElement('button');
    refreshBtn.id = 'usageRefreshBtn';
    refreshBtn.className = 'usage-refresh-btn';
    refreshBtn.title = 'Refresh quota from providers';
    refreshBtn.textContent = '\u21BB';
    refreshBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fetchAllQuotas({ source: 'manual' });
    });
  }
  badgesContainer.appendChild(refreshBtn);
}

function showDetailPopup(badgeEl) {
  if (detailPopup) {
    detailPopup.remove();
    detailPopup = null;
    return;
  }

  detailPopup = document.createElement('div');
  detailPopup.className = 'usage-detail-popup';

  let html = '';

  // Quota section
  const quota = state.quotaData;
  const hasQuota = (quota.claude && !quota.claude.error) || (quota.codex && !quota.codex.error);
  if (hasQuota) {
    html += '<div class="usage-detail-title">Provider Quota</div>';
    if (quota.claude && !quota.claude.error) {
      html += renderQuotaRow('claude', quota.claude);
    }
    if (quota.codex && !quota.codex.error) {
      html += renderQuotaRow('codex', quota.codex);
    }
    if (quota.lastFetch) {
      const ago = Math.round((Date.now() - quota.lastFetch.getTime()) / 60000);
      html += `<div class="usage-detail-meta">Updated ${ago < 1 ? 'just now' : ago + 'm ago'}</div>`;
    }
  }

  // Claude login / errors
  const claudeNeedsLogin = quota.claude && (quota.claude.needsLogin || (quota.claude.error && quota.claude.error.includes('Not logged in')));
  if (claudeNeedsLogin || (quota.claude && quota.claude.error)) {
    html += `<div class="usage-detail-row">
      <span class="usage-detail-dot" style="background:${CLI_COLORS.claude.bg}"></span>
      <span class="usage-detail-label">claude</span>
      <span class="usage-detail-value">
        ${claudeNeedsLogin ? '<button class="usage-login-btn" data-provider="claude">Login to Claude</button>' : `<span class="usage-error">${escapeHtml(quota.claude.error).slice(0, 50)}</span>`}
      </span>
    </div>`;
  }

  // Codex login / errors
  const codexNeedsLogin = quota.codex && (quota.codex.needsLogin || (quota.codex.error && quota.codex.error.includes('Not logged in')));
  if (codexNeedsLogin || (quota.codex && quota.codex.error)) {
    html += `<div class="usage-detail-row">
      <span class="usage-detail-dot" style="background:${CLI_COLORS.codex.bg}"></span>
      <span class="usage-detail-label">codex</span>
      <span class="usage-detail-value">
        ${codexNeedsLogin ? '<button class="usage-login-btn" data-provider="codex">Login to ChatGPT</button>' : `<span class="usage-error">${escapeHtml(quota.codex.error).slice(0, 50)}</span>`}
      </span>
    </div>`;
  }
  // Always show codex login option if never fetched
  if (!quota.codex && state.usageStats.has('codex')) {
    html += `<div class="usage-detail-row">
      <span class="usage-detail-dot" style="background:${CLI_COLORS.codex.bg}"></span>
      <span class="usage-detail-label">codex</span>
      <span class="usage-detail-value"><button class="usage-login-btn" data-provider="codex">Login to ChatGPT</button></span>
    </div>`;
  }

  // Session stats section
  const stats = state.usageStats;
  if (stats.size > 0) {
    html += '<div class="usage-detail-title" style="margin-top:10px">Session Stats</div>';
    for (const [type, data] of stats) {
      const colors = CLI_COLORS[type] || CLI_COLORS.other;
      html += `<div class="usage-detail-row">
        <span class="usage-detail-dot" style="background:${colors.bg}"></span>
        <span class="usage-detail-label">${type}</span>
        <span class="usage-detail-value">${data.messages} msgs &middot; ${formatChars(data.chars)} chars</span>
      </div>`;
    }
  }

  if (!html) {
    html = '<div class="usage-detail-title">No usage data yet</div><div class="usage-detail-meta">Send a message or click refresh</div>';
  }

  detailPopup.innerHTML = html;
  document.body.appendChild(detailPopup);

  // Wire up login buttons if present
  const loginBtns = detailPopup.querySelectorAll('.usage-login-btn[data-provider]');
  loginBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const provider = btn.dataset.provider;
      btn.textContent = 'Waiting for login...';
      btn.disabled = true;
      await openProviderLoginAndRetry(provider);
      if (detailPopup) {
        detailPopup.remove();
        detailPopup = null;
      }
    });
  });

  // Position above the badge
  const rect = badgeEl.getBoundingClientRect();
  detailPopup.style.left = Math.max(0, rect.left) + 'px';
  detailPopup.style.bottom = (window.innerHeight - rect.top + 6) + 'px';

  // Close on outside click
  const closeHandler = (e) => {
    if (detailPopup && !detailPopup.contains(e.target) && !e.target.closest('.usage-badge')) {
      detailPopup.remove();
      detailPopup = null;
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 0);
}

async function openProviderLoginAndRetry(provider) {
  const label = provider === 'claude' ? 'Claude' : 'ChatGPT';
  try {
    setUsageStatus(`Waiting for ${label} login...`, '#dcdcaa');
    const loginFn = provider === 'claude' ? api.openClaudeLogin : api.openCodexLogin;
    const result = await loginFn();
    if (!result || !result.success) {
      setUsageStatus('Failed to open login window', '#f48771');
      return;
    }
    // Login window is now closed — re-fetch quota
    setUsageStatus(`Login complete — fetching ${label} quota...`, '#dcdcaa');
    const fetchFn = provider === 'claude' ? fetchClaudeQuota : fetchCodexQuota;
    await fetchFn();
    const q = state.quotaData[provider];
    if (q && !q.error && (q.fiveHourRemaining !== null || q.weeklyRemaining !== null)) {
      const pct = q.fiveHourRemaining ?? q.weeklyRemaining;
      setUsageStatus(`${label} quota: ${pct}%`, '#4ec9b0');
    } else if (q && q.error) {
      setUsageStatus(`${label}: ${q.error}`, '#f48771');
    }
    renderBadges();
  } catch (err) {
    setUsageStatus('Login flow error: ' + err.message, '#f48771');
  }
}

function renderQuotaRow(type, q) {
  const colors = CLI_COLORS[type] || CLI_COLORS.other;
  let valueText = '';
  if (q.fiveHourRemaining !== null) {
    valueText += `${q.fiveHourRemaining}% (5hr)`;
  }
  if (q.weeklyRemaining !== null) {
    if (valueText) valueText += ' &middot; ';
    valueText += `${q.weeklyRemaining}% (week)`;
  }
  return `<div class="usage-detail-row">
    <span class="usage-detail-dot" style="background:${colors.bg}"></span>
    <span class="usage-detail-label">${type}</span>
    <span class="usage-detail-value">${valueText || 'No data'}</span>
  </div>`;
}

function formatChars(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = { init, recordUsage, renderBadges, normalizeCliType, fetchAllQuotas };
