const path = require('path');
const fs = require('fs');

const todoWatchers = new Map();

function parseTodoMarkdown(md = '') {
  const lines = String(md).split(/\r?\n/);
  const sections = [];
  let current = null;
  const items = [];
  for (const line of lines) {
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
    if (heading) {
      const title = (heading[2] || '').trim();
      if (title.length === 0) continue;
      current = { title, items: [] };
      sections.push(current);
      continue;
    }
    const m = line.match(/^\s*[-*]\s*\[( |x|X)\]\s*(.*)$/);
    if (m) {
      const done = m[1].toLowerCase() === 'x';
      const text = (m[2] || '').trim();
      const item = { text, done };
      items.push(item);
      if (!current) {
        current = sections.find(s => s.title === 'Uncategorized');
        if (!current) {
          current = { title: 'Uncategorized', items: [] };
          sections.push(current);
        }
      }
      current.items.push(item);
    }
  }
  return { items, sections };
}

function serializeTodoMarkdown(model) {
  const header = '# TODO\n\n';
  const sections = Array.isArray(model?.sections) && model.sections.length > 0
    ? model.sections
    : [{ title: null, items: Array.isArray(model?.items) ? model.items : [] }];
  let body = '';
  for (const sec of sections) {
    if (sec.title) {
      body += `## ${sec.title}\n`;
    }
    for (const it of (sec.items || [])) {
      body += `- [${it.done ? 'x' : ' '}] ${it.text || ''}\n`;
    }
    if (sec.title) body += '\n';
  }
  return header + body;
}

function loadTodo(projectPath) {
  if (!projectPath) throw new Error('Missing projectPath');
  const rootTodo = path.join(projectPath, 'TODO.md');
  const rootTodoLower = path.join(projectPath, 'todo.md');
  const legacyJson = path.join(projectPath, '.supercli', '.todo');

  let items = [];
  let sections = [];
  if (fs.existsSync(rootTodo)) {
    const md = fs.readFileSync(rootTodo, 'utf8');
    ({ items, sections } = parseTodoMarkdown(md));
  } else if (fs.existsSync(rootTodoLower)) {
    const md = fs.readFileSync(rootTodoLower, 'utf8');
    ({ items, sections } = parseTodoMarkdown(md));
  } else if (fs.existsSync(legacyJson)) {
    const raw = fs.readFileSync(legacyJson, 'utf8').trim();
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        items = Array.isArray(parsed) ? parsed : (parsed.items || []);
      } catch (e) {
        items = raw.split(/\r?\n/).filter(Boolean).map(t => ({ text: t, done: false }));
      }
    }
  } else {
    const initial = '# TODO\n\n';
    fs.writeFileSync(rootTodo, initial, 'utf8');
    items = [];
  }

  if (!sections || sections.length === 0) {
    sections = [];
    if (items.length > 0) {
      sections.push({ title: 'Uncategorized', items });
    }
  }

  return { items, sections };
}

function saveTodo(projectPath, data) {
  if (!projectPath) throw new Error('Missing projectPath');
  const rootTodo = path.join(projectPath, 'TODO.md');
  let md;
  if (Array.isArray(data)) {
    md = serializeTodoMarkdown({ items: data, sections: [] });
  } else if (data && typeof data === 'object') {
    md = serializeTodoMarkdown(data);
  } else {
    md = serializeTodoMarkdown({ items: [], sections: [] });
  }
  fs.writeFileSync(rootTodo, md, 'utf8');
}

function watchTodo(projectPath, mainWindow) {
  if (!projectPath) throw new Error('Missing projectPath');
  const rootTodo = path.join(projectPath, 'TODO.md');
  if (!fs.existsSync(rootTodo)) fs.writeFileSync(rootTodo, '# TODO\n\n', 'utf8');
  if (todoWatchers.has(projectPath)) {
    return { success: true, watching: true };
  }
  let debounceTimer = null;
  const watcher = fs.watch(rootTodo, { persistent: true }, (eventType) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      try {
        const md = fs.readFileSync(rootTodo, 'utf8');
        const parsed = parseTodoMarkdown(md);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('todo-updated-from-disk', projectPath, { items: parsed.items, sections: parsed.sections });
        }
      } catch (_) { /* ignore */ }
    }, 150);
  });
  todoWatchers.set(projectPath, watcher);
  return { success: true, watching: true };
}

function unwatchTodo(projectPath) {
  const watcher = todoWatchers.get(projectPath);
  if (watcher) {
    try { watcher.close(); } catch (_) {}
    todoWatchers.delete(projectPath);
  }
}

function closeAllWatchers() {
  todoWatchers.forEach((watcher) => {
    try { watcher.close(); } catch (_) {}
  });
  todoWatchers.clear();
}

module.exports = {
  parseTodoMarkdown,
  serializeTodoMarkdown,
  loadTodo,
  saveTodo,
  watchTodo,
  unwatchTodo,
  closeAllWatchers
};
