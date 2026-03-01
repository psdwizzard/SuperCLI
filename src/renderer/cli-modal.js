const state = require('./state');
const api = require('./api');

let cliModal, cliOptions, customCliInput, customCliCommand, modalCancel, modalConfirm, newProjectCheckbox;
let inputInfo;

let setActiveProjectCb = null;
let createNewTerminalCb = null;

function init(callbacks) {
  cliModal = document.getElementById('cliModal');
  cliOptions = document.querySelectorAll('.cli-option');
  customCliInput = document.getElementById('customCliInput');
  customCliCommand = document.getElementById('customCliCommand');
  modalCancel = document.getElementById('modalCancel');
  modalConfirm = document.getElementById('modalConfirm');
  newProjectCheckbox = document.getElementById('newProjectCheckbox');
  inputInfo = document.getElementById('inputInfo');

  if (callbacks) {
    setActiveProjectCb = callbacks.setActiveProject;
    createNewTerminalCb = callbacks.createNewTerminal;
  }
}

function showCliModal() {
  cliOptions.forEach(opt => opt.classList.remove('selected'));
  state.selectedCli = null;
  customCliInput.style.display = 'none';
  customCliCommand.value = '';
  if (newProjectCheckbox) {
    newProjectCheckbox.checked = false;
  }
  cliModal.classList.add('active');
}

function hideCliModal() {
  cliModal.classList.remove('active');
}

async function handleCliConfirm() {
  console.log('handleCliConfirm called, selectedCli:', state.selectedCli);

  if (!state.selectedCli) {
    if (inputInfo) {
      inputInfo.textContent = 'Please select a CLI';
      inputInfo.style.color = '#f48771';
      setTimeout(() => {
        inputInfo.textContent = 'Ready';
        inputInfo.style.color = '#858585';
      }, 3000);
    }
    return;
  }

  let cliCommand;
  if (state.selectedCli === 'custom') {
    cliCommand = customCliCommand.value.trim();
    if (!cliCommand) {
      if (inputInfo) {
        inputInfo.textContent = 'Please enter a custom CLI command';
        inputInfo.style.color = '#f48771';
      }
      return;
    }
  } else {
    cliCommand = state.selectedCli;
  }

  console.log('CLI command:', cliCommand);
  const requestNewProject = newProjectCheckbox ? newProjectCheckbox.checked : false;

  // Check if a template was selected
  const templateSelect = document.getElementById('templateSelect');
  const selectedTemplate = templateSelect?.value || '';

  hideCliModal();

  if (!state.activeProjectPath || requestNewProject) {
    const result = await api.selectProjectFolder();
    if (result) {
      state.projectInfo = result;
      if (result.userPrefs) {
        state.userPrefsByProject.set(result.projectPath, result.userPrefs);
      }
      if (setActiveProjectCb) await setActiveProjectCb(result.projectPath);

      // Apply template if selected
      if (selectedTemplate && selectedTemplate !== 'none') {
        if (selectedTemplate === '__save_current__') {
          // Will be handled by templates module
          const { showSaveTemplateDialog } = require('./templates');
          showSaveTemplateDialog();
        } else {
          await api.applyTemplate(selectedTemplate, result.projectPath);
        }
      }
    } else {
      console.log('User cancelled folder selection');
      return;
    }
  }

  console.log('Creating terminal with CLI:', cliCommand);
  try {
    if (createNewTerminalCb) await createNewTerminalCb(cliCommand);
    console.log('Terminal created successfully');
  } catch (error) {
    console.error('Error creating terminal:', error);
  }
}

async function selectProjectFolder() {
  const result = await api.selectProjectFolder();
  if (result) {
    state.projectInfo = result;
    if (result.userPrefs) {
      state.userPrefsByProject.set(result.projectPath, result.userPrefs);
    }
    if (setActiveProjectCb) await setActiveProjectCb(result.projectPath);
    if (inputInfo) {
      inputInfo.textContent = 'Project folder selected';
      inputInfo.style.color = '#4ec9b0';
      setTimeout(() => {
        inputInfo.textContent = 'Ready';
        inputInfo.style.color = '#858585';
      }, 3000);
    }
  }
}

module.exports = {
  init,
  showCliModal,
  hideCliModal,
  handleCliConfirm,
  selectProjectFolder
};
