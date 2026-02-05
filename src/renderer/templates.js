const state = require('./state');
const api = require('./api');

let templateSelectorContainer = null;

function init() {
  templateSelectorContainer = document.getElementById('templateSelectorContainer');
}

async function loadTemplateList() {
  const res = await api.listTemplates();
  if (res?.success) {
    return res.templates || [];
  }
  return [];
}

async function renderTemplateSelector(container) {
  if (!container) return;
  container.innerHTML = '';

  const label = document.createElement('label');
  label.textContent = 'Template:';
  label.className = 'template-label';
  label.setAttribute('for', 'templateSelect');

  const select = document.createElement('select');
  select.id = 'templateSelect';
  select.className = 'template-select settings-select';

  const noneOpt = document.createElement('option');
  noneOpt.value = 'none';
  noneOpt.textContent = 'None';
  select.appendChild(noneOpt);

  const templates = await loadTemplateList();
  templates.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    opt.textContent = t.name;
    if (t.description) opt.title = t.description;
    select.appendChild(opt);
  });

  const saveOpt = document.createElement('option');
  saveOpt.value = '__save_current__';
  saveOpt.textContent = 'Save Current as Template...';
  select.appendChild(saveOpt);

  container.appendChild(label);
  container.appendChild(select);
}

function toggleTemplateSelector(visible) {
  if (!templateSelectorContainer) return;
  if (visible) {
    templateSelectorContainer.style.display = 'block';
    renderTemplateSelector(templateSelectorContainer);
  } else {
    templateSelectorContainer.style.display = 'none';
  }
}

async function applyTemplate(templateName, projectPath) {
  const res = await api.applyTemplate(templateName, projectPath);
  return res;
}

function showSaveTemplateDialog() {
  // Create a simple modal for saving template
  let modal = document.getElementById('saveTemplateModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'saveTemplateModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 450px;">
        <h2>Save as Template</h2>
        <p class="modal-subtitle">Save current project settings as a reusable template</p>
        <div class="settings-grid" style="margin-bottom: 16px;">
          <label for="templateName">Name</label>
          <input id="templateNameInput" class="settings-input" type="text" placeholder="My Template" />
          <label for="templateDesc">Description</label>
          <input id="templateDescInput" class="settings-input" type="text" placeholder="Description" />
        </div>
        <div class="modal-actions">
          <button class="modal-btn modal-cancel" id="saveTemplateCancelBtn">Cancel</button>
          <button class="modal-btn modal-confirm" id="saveTemplateSaveBtn">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  modal.classList.add('active');

  const cancelBtn = document.getElementById('saveTemplateCancelBtn');
  const saveBtn = document.getElementById('saveTemplateSaveBtn');

  const cleanup = () => {
    modal.classList.remove('active');
    cancelBtn.removeEventListener('click', onCancel);
    saveBtn.removeEventListener('click', onSave);
  };

  const onCancel = () => cleanup();
  const onSave = async () => {
    const name = (document.getElementById('templateNameInput')?.value || '').trim();
    const description = (document.getElementById('templateDescInput')?.value || '').trim();
    if (!name) return;

    const projectPath = state.activeProjectPath;
    const prefs = state.userPrefsByProject.get(projectPath) || {};
    const todoData = state.todoByProject.get(projectPath) || { sections: [] };
    const snippets = state.snippetsByProject.get(projectPath) || [];

    const todoItems = [];
    (todoData.sections || []).forEach(s => {
      (s.items || []).forEach(i => {
        if (!i.done) todoItems.push(i.text);
      });
    });

    const template = {
      name,
      description,
      cli: state.selectedCli || '',
      settings: prefs,
      todoItems,
      snippets
    };

    await api.saveTemplate(template);
    cleanup();
  };

  cancelBtn.addEventListener('click', onCancel);
  saveBtn.addEventListener('click', onSave);
}

module.exports = {
  init,
  loadTemplateList,
  renderTemplateSelector,
  toggleTemplateSelector,
  applyTemplate,
  showSaveTemplateDialog
};
