const API_URL = 'http://localhost:5555';
let tools = [];

function quitApp() {
    window.api.quit();
}

async function loadTools() {
    try {
        const res = await fetch(`${API_URL}/tools`);
        if(res.ok) {
            tools = await res.json();
            renderTools();
        }
    } catch(e) {
        // Backend not ready or offline
    }
}

function renderTools() {
    const container = document.getElementById('tool-list-container');
    container.innerHTML = '';

    if (tools.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: var(--text-dim); padding-top: 40px; font-size: 12px;">
                <i class="fa-solid fa-ghost" style="font-size: 30px; margin-bottom: 15px; opacity: 0.5;"></i>
                <p>Nenhuma ferramenta adicionada.</p>
            </div>
        `;
        return;
    }

    tools.forEach(tool => {
        const item = document.createElement('div');
        item.className = 'tool-item';
        
        let statusDot = `<div class="status-dot ${tool.running ? 'online' : ''}"></div>`;
        let actionButtons = tool.running 
            ? `<button class="action-btn stop" id="btn-toggle-${tool.id}" onclick="toggleTool('${tool.id}')"><i class="fa-solid fa-stop"></i></button>`
            : `<button class="action-btn play" id="btn-toggle-${tool.id}" onclick="toggleTool('${tool.id}')"><i class="fa-solid fa-play"></i></button>`;

        item.innerHTML = `
            <div class="tool-info" title="${tool.command}">
                ${statusDot}
                <div class="tool-name">${tool.name}</div>
            </div>
            <div class="tool-actions">
                ${actionButtons}
                <button class="action-btn delete" onclick="removeTool('${tool.id}')"><i class="fa-solid fa-trash-can"></i></button>
            </div>
        `;
        container.appendChild(item);
    });
}

function openAddModal() {
    document.getElementById('addModal').classList.add('active');
}

function closeAddModal() {
    document.getElementById('addModal').classList.remove('active');
}

async function browseFile() {
    const res = await window.api.openFileDialog();
    if (res) document.getElementById('toolCommand').value = res;
}

async function browseDir() {
    const res = await window.api.openDirDialog();
    if (res) document.getElementById('toolDir').value = res;
}

async function addTool() {
    const name = document.getElementById('toolName').value;
    const dir = document.getElementById('toolDir').value;
    const cmd = document.getElementById('toolCommand').value;

    if (!name || !cmd) return;

    try {
        const res = await fetch(`${API_URL}/tools`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, command: cmd, directory: dir })
        });
        tools = await res.json();
        renderTools();
        closeAddModal();
        
        document.getElementById('toolName').value = '';
        document.getElementById('toolDir').value = '';
        document.getElementById('toolCommand').value = '';
    } catch(e) { console.error(e); }
}

async function removeTool(id) {
    try {
        const res = await fetch(`${API_URL}/tools/${id}`, { method: 'DELETE' });
        tools = await res.json();
        renderTools();
    } catch(e) {}
}

async function toggleTool(id) {
    const btn = document.getElementById(`btn-toggle-${id}`);
    if (btn) {
        if (btn.disabled) return; // Prevent double click
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    }
    try {
        const res = await fetch(`${API_URL}/tools/${id}/toggle`, { method: 'POST' });
        tools = await res.json();
        renderTools();
    } catch(e) {
        if (btn) btn.disabled = false;
    }
}

setInterval(loadTools, 2000);
loadTools();
