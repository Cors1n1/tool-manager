const API_URL = 'http://localhost:5555';
let tools = [];
let previousState = {};
let workspaces = {};
let activeLogsToolId = null;
let logsInterval = null;
let isPinned = localStorage.getItem('isPinned') === 'true';

// Load saved theme
const savedTheme = localStorage.getItem('themeColor');
if (savedTheme) {
    document.documentElement.style.setProperty('--accent-rgb', savedTheme);
}

// Dropdown Logic
function toggleThemeMenu() {
    const menu = document.getElementById('themeMenu');
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
}

// Close dropdown if clicked outside
document.addEventListener('click', (e) => {
    const container = document.querySelector('.theme-menu-container');
    const menu = document.getElementById('themeMenu');
    if (container && !container.contains(e.target) && menu && menu.style.display === 'block') {
        menu.style.display = 'none';
    }
});

// Theme Change Function
function setTheme(rgbString) {
    document.documentElement.style.setProperty('--accent-rgb', rgbString);
    localStorage.setItem('themeColor', rgbString);
}

setTimeout(() => {
    if (isPinned) {
        const btn = document.getElementById('pinBtn');
        if (btn) btn.classList.add('active');
        if (window.api && window.api.toggleAlwaysOnTop) {
            window.api.toggleAlwaysOnTop(true);
        }
    }
}, 500);

function quitApp() {
    window.api.quit();
}

async function togglePin() {
    isPinned = !isPinned;
    localStorage.setItem('isPinned', isPinned);
    
    const btn = document.getElementById('pinBtn');
    if (isPinned) btn.classList.add('active');
    else btn.classList.remove('active');
    
    const isModalActive = document.getElementById('addModal') && document.getElementById('addModal').classList.contains('active');
    if (!isModalActive && window.api && window.api.toggleAlwaysOnTop) {
        await window.api.toggleAlwaysOnTop(isPinned);
    }
}

// Clock
setInterval(() => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString();
    document.getElementById('dashTime').innerText = timeStr;
}, 1000);
// Weather
async function fetchWeather() {
    try {
        const ipRes = await fetch('https://get.geojs.io/v1/ip/geo.json');
        const ipData = await ipRes.json();
        if (ipData.latitude && ipData.longitude) {
            const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${ipData.latitude}&longitude=${ipData.longitude}&current_weather=true`);
            const wData = await wRes.json();
            if (wData.current_weather) {
                document.getElementById('dashWeather').innerHTML = `<i class="fa-solid fa-cloud"></i> ${wData.current_weather.temperature}°C`;
                document.getElementById('dashWeather').title = ipData.city || 'Sua Localização';
            }
        }
    } catch(e) {
        console.error("Failed to fetch weather", e);
    }
}
fetchWeather();
setInterval(fetchWeather, 30 * 60 * 1000); // 30 mins


// System Info
async function fetchSystemInfo() {
    try {
        const res = await fetch(`${API_URL}/system-info`);
        if(res.ok) {
            const data = await res.json();
            const cpu = data.cpu_percent.toFixed(1);
            const ram = data.memory.percent.toFixed(1);
            
            document.getElementById('dashCpu').innerText = `${cpu}%`;
            document.getElementById('dashRam').innerText = `${ram}%`;
            
            if (window.api && window.api.updateTrayTooltip) {
                window.api.updateTrayTooltip(cpu, ram);
            }
            
            let totalDisk = 0;
            let usedDisk = 0;
            data.disks.forEach(disk => {
                totalDisk += disk.total;
                usedDisk += disk.used;
            });
            const diskPercent = totalDisk > 0 ? ((usedDisk / totalDisk) * 100).toFixed(1) : 0;
            document.getElementById('dashDisk').innerText = `${diskPercent}%`;
        }
    } catch(e) {}
}
fetchSystemInfo();
setInterval(fetchSystemInfo, 2000);

// Global toggle trigger from IPC Listeners
if (window.api && window.api.onTriggerToggle) {
    window.api.onTriggerToggle((event, payload) => {
        if (typeof payload === 'object') {
            if (payload.type === 'workspace') {
                toggleWorkspace(payload.id, 'toggle');
            } else if (payload.type === 'tool') {
                toggleTool(payload.id);
            }
        } else {
            toggleTool(payload);
        }
    });
}

if (window.api && window.api.onTriggerStopAll) {
    window.api.onTriggerStopAll(async () => {
        try {
            await fetch(`${API_URL}/tools/stop-all`, { method: 'POST' });
            loadTools();
        } catch(e) {
            console.error('Failed to stop all tools', e);
        }
    });
}

async function loadTools() {
    try {
        const wsRes = await fetch(`${API_URL}/workspaces`);
        if(wsRes.ok) workspaces = await wsRes.json();

        const res = await fetch(`${API_URL}/tools`);
        if(res.ok) {
            tools = await res.json();
            
            const currentStateString = JSON.stringify({ tools, workspaces });
            let stateChanged = false;
            if (window.lastToolsState !== currentStateString) {
                stateChanged = true;
                window.lastToolsState = currentStateString;
            }

                        // Check for state changes for notifications
            let shortcutsMap = {};
            tools.forEach(t => {
                if (t.hotkey) shortcutsMap[t.hotkey] = { type: 'tool', id: t.id };
                
                if (previousState[t.id] !== undefined) {
                    if (previousState[t.id] === true && t.running === false) {
                        // Tool stopped
                        if (window.api && window.api.showNotification) {
                            window.api.showNotification('Tool Manager', `A ferramenta '${t.name}' foi interrompida.`);
                        }
                    }
                }
                previousState[t.id] = t.running;
            });

            // Add workspace hotkeys
            Object.entries(workspaces).forEach(([wsName, wsData]) => {
                if (wsData.hotkey) {
                    shortcutsMap[wsData.hotkey] = { type: 'workspace', id: wsName };
                }
            });
            
            if (window.api && window.api.registerShortcuts) {
                window.api.registerShortcuts(shortcutsMap);
            }
            
            if (window.api && window.api.updateTrayMenu && stateChanged) {
                window.api.updateTrayMenu(tools);
            }
            
            if (stateChanged) {
                renderTools();
            }
        }
    } catch(e) {
        // Backend not ready or offline
    }
}

let dragStartIndex = -1;

function createToolItem(tool) {
    const item = document.createElement('div');
    item.className = 'tool-item';
    item.draggable = true;
    item.dataset.id = tool.id;
    item.dataset.index = tool._index;
    
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragover', handleDragOver);
    item.addEventListener('drop', handleDrop);
    item.addEventListener('dragenter', handleDragEnter);
    item.addEventListener('dragleave', handleDragLeave);
    item.addEventListener('dragend', function() { this.style.opacity = '1'; });

    if (tool.running) item.classList.add('running');
    
    let statusDot = `<div class="status-dot ${tool.running ? 'online' : ''}"></div>`;
    
    let portBadge = '';
    if (tool.running && tool.active_port) {
        portBadge = `<a href="http://localhost:${tool.active_port}" target="_blank" class="port-badge" title="Abrir no navegador">🌐 :${tool.active_port}</a>`;
    }

    let actionButtons = tool.running 
        ? `<button class="action-btn stop" id="btn-toggle-${tool.id}" onclick="toggleTool('${tool.id}')" title="Parar"><i class="fa-solid fa-stop"></i></button>`
        : `<button class="action-btn play" id="btn-toggle-${tool.id}" onclick="toggleTool('${tool.id}')" title="Iniciar"><i class="fa-solid fa-play"></i></button>`;

    item.innerHTML = `
        <div class="tool-info" title="${escapeHtml(tool.command)}">
            <i class="fa-solid fa-grip-vertical" style="color: var(--border); margin-right: 8px; cursor: grab; font-size: 14px;"></i>
            ${statusDot}
            <div class="tool-name">${escapeHtml(tool.name)}</div>
            ${portBadge}
        </div>
        <div class="tool-actions">
            <button class="action-btn hover-only" onclick="openLogsModal('${tool.id}', '${escapeHtml(tool.name)}')" title="Logs"><i class="fa-solid fa-terminal"></i></button>
            <button class="action-btn hover-only" onclick="openEditModal('${tool.id}')" title="Editar"><i class="fa-solid fa-pen"></i></button>
            <button class="action-btn delete hover-only" onclick="removeTool('${tool.id}')" title="Excluir"><i class="fa-solid fa-trash-can"></i></button>
            ${actionButtons}
        </div>
    `;
    return item;
}

function renderTools() {
    const container = document.getElementById('tool-list-container');
    container.innerHTML = '';

    if (tools.length === 0 && Object.keys(workspaces).length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: var(--text-dim); padding-top: 40px; font-size: 12px;">
                <i class="fa-solid fa-folder-open" style="font-size: 30px; margin-bottom: 15px; opacity: 0.5;"></i>
                <p>Nenhum projeto ou ferramenta.</p>
                <p style="margin-top: 10px; opacity: 0.7;">Clique nos ícones no topo para começar.</p>
            </div>
        `;
        return;
    }

    const groups = {};
    Object.keys(workspaces).forEach(ws => {
        groups[ws] = [];
    });

    const looseTools = [];

    tools.forEach((t, i) => {
        t._index = i;
        const cat = t.category;
        if (!cat || cat === 'Geral' || !workspaces[cat]) {
            looseTools.push(t);
        } else {
            groups[cat].push(t);
        }
    });

    for (const [catName, catTools] of Object.entries(groups)) {
        const wsData = workspaces[catName] || {};
        const hotkeyText = wsData.hotkey ? `<span style="color:var(--text-dim);font-size:10px;margin-left:8px;background:rgba(255,255,255,0.05);padding:2px 5px;border-radius:4px;">[${wsData.hotkey}]</span>` : '';
        
        const isCollapsed = localStorage.getItem(`ws-collapse-${catName}`) === 'true';
        const collapseClass = isCollapsed ? 'collapsed' : '';
        const bodyStyle = isCollapsed ? 'display: none;' : '';
        
        const groupEl = document.createElement('div');
        groupEl.className = 'workspace-group';
        groupEl.innerHTML = `
            <div class="workspace-header">
                <div class="workspace-title" style="display:flex; align-items:center;">
                    <i class="fa-solid fa-chevron-down collapse-icon ${collapseClass}" onclick="toggleWsCollapse('${escapeHtml(catName)}')"></i>
                    <i class="fa-solid fa-layer-group" style="margin-right:5px;"></i> ${escapeHtml(catName)} ${hotkeyText}
                </div>
                <div class="workspace-actions">
                    <button class="ws-btn" title="Editar Nome" onclick="editWorkspace('${escapeHtml(catName)}')"><i class="fa-solid fa-pen"></i></button>
                    <button class="ws-btn" title="Excluir Pasta" onclick="deleteWorkspace('${escapeHtml(catName)}')"><i class="fa-solid fa-trash-can" style="color: var(--danger);"></i></button>
                    <button class="ws-btn hotkey" title="Gravar Atalho do Workspace" onclick="openWsHotkeyModal('${escapeHtml(catName)}')"><i class="fa-solid fa-keyboard"></i></button>
                    <button class="ws-btn play" title="Ligar Tudo" onclick="toggleWorkspace('${escapeHtml(catName)}', 'start', this)"><i class="fa-solid fa-play"></i></button>
                    <button class="ws-btn stop" title="Parar Tudo" onclick="toggleWorkspace('${escapeHtml(catName)}', 'stop', this)"><i class="fa-solid fa-stop"></i></button>
                </div>
            </div>
            <div class="workspace-body" style="${bodyStyle}"></div>
        `;
        
        const bodyEl = groupEl.querySelector('.workspace-body');
        
        groupEl.dataset.category = catName;
        groupEl.addEventListener('dragover', handleWsDragOver);
        groupEl.addEventListener('dragenter', handleWsDragEnter);
        groupEl.addEventListener('dragleave', handleWsDragLeave);
        groupEl.addEventListener('drop', handleWsDrop);

        catTools.forEach(tool => {
            bodyEl.appendChild(createToolItem(tool));
        });
        
        const addRow = document.createElement('div');
        addRow.innerHTML = `<button class="ws-btn add-tool-row" onclick="openAddModal('${escapeHtml(catName)}')"><i class="fa-solid fa-plus"></i> Nova Ferramenta</button>`;
        bodyEl.appendChild(addRow);
        
        container.appendChild(groupEl);
    }

    const looseContainer = document.createElement('div');
    looseContainer.className = 'loose-tools-container workspace-body';
    looseContainer.dataset.category = 'Geral';
    
    looseContainer.addEventListener('dragover', handleWsDragOver);
    looseContainer.addEventListener('dragenter', handleWsDragEnter);
    looseContainer.addEventListener('dragleave', handleWsDragLeave);
    looseContainer.addEventListener('drop', handleWsDrop);

    if (looseTools.length === 0) {
        looseContainer.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-dim); font-size: 12px; border: 1px dashed rgba(255,255,255,0.1); border-radius: 8px; pointer-events: none;"><i class="fa-solid fa-download"></i> Área de ferramentas soltas (Arraste aqui)</div>`;
    } else {
        looseTools.forEach(tool => {
            looseContainer.appendChild(createToolItem(tool));
        });
    }
    
    container.appendChild(looseContainer);
}

function toggleWsCollapse(name) {
    const key = `ws-collapse-${name}`;
    const isCollapsed = localStorage.getItem(key) === 'true';
    localStorage.setItem(key, !isCollapsed);
    renderTools();
}

let confirmCallback = null;

function customConfirm(message, callback, isDanger = true) {
    document.getElementById('confirmMessage').innerText = message;
    const okBtn = document.getElementById('confirmOkBtn');
    if (isDanger) {
        okBtn.style.background = 'var(--danger)';
        okBtn.style.borderColor = 'var(--danger)';
        okBtn.innerText = 'Excluir';
    } else {
        okBtn.style.background = 'var(--accent)';
        okBtn.style.borderColor = 'var(--accent)';
        okBtn.innerText = 'Confirmar';
    }
    
    confirmCallback = callback;
    document.getElementById('confirmModal').classList.add('active');
    
    if (window.api && window.api.toggleAlwaysOnTop) {
        window.api.toggleAlwaysOnTop(true);
    }
}

function closeConfirmModal() {
    document.getElementById('confirmModal').classList.remove('active');
    if (window.api && window.api.toggleAlwaysOnTop) {
        window.api.toggleAlwaysOnTop(localStorage.getItem('isPinned') === 'true');
    }
}

let promptCallback = null;

function customPrompt(message, defaultValue, callback) {
    document.getElementById('promptMessage').innerText = message;
    const input = document.getElementById('promptInput');
    input.value = defaultValue || '';
    promptCallback = callback;
    
    document.getElementById('promptModal').classList.add('active');
    input.focus();
    input.select();
    
    if (window.api && window.api.toggleAlwaysOnTop) {
        window.api.toggleAlwaysOnTop(true);
    }
}

function closePromptModal() {
    document.getElementById('promptModal').classList.remove('active');
    if (window.api && window.api.toggleAlwaysOnTop) {
        window.api.toggleAlwaysOnTop(localStorage.getItem('isPinned') === 'true');
    }
}

function editWorkspace(oldName) {
    customPrompt("Digite o novo nome da pasta:", oldName, async (newName) => {
        if (!newName || newName.trim() === '' || newName === oldName) return;
        
        try {
            const res = await fetch(`${API_URL}/workspaces/${encodeURIComponent(oldName)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ new_name: newName.trim() })
            });
            if(res.ok) {
                loadTools(); // Recarrega tudo
            }
        } catch(e) {}
    });
}

function deleteWorkspace(name) {
    customConfirm(`Tem certeza que deseja excluir a pasta '${name}'?\nAs ferramentas dentro dela voltarão para Geral.`, async () => {
        try {
            const res = await fetch(`${API_URL}/workspaces/${encodeURIComponent(name)}`, {
                method: 'DELETE'
            });
            if(res.ok) {
                loadTools(); // Recarrega tudo
            }
        } catch(e) {}
    });
}

function handleDragStart(e) {
    dragStartIndex = +this.dataset.index;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.index);
    this.style.opacity = '0.4';
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDragEnter(e) {
    this.classList.add('drag-over');
}

function handleDragLeave(e) {
    this.classList.remove('drag-over');
}

async function handleDrop(e) {
    e.stopPropagation();
    this.classList.remove('drag-over');
    this.style.opacity = '1';
    
    const dragEndIndex = +this.dataset.index;
    
    if (dragStartIndex !== dragEndIndex && dragStartIndex > -1) {
        const draggedTool = tools[dragStartIndex];
        const destTool = tools[dragEndIndex];
        
        let categoryChanged = false;
        if (draggedTool.category !== destTool.category) {
            draggedTool.category = destTool.category;
            categoryChanged = true;
        }

        tools.splice(dragStartIndex, 1);
        tools.splice(dragEndIndex, 0, draggedTool);
        
        renderTools();
        
        if (categoryChanged) {
            await fetch(`${API_URL}/tools/${draggedTool.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(draggedTool)
            });
        }
        
        const order = tools.map(t => t.id);
        try {
            await fetch(`${API_URL}/tools/reorder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order })
            });
        } catch(err) { console.error(err); }
    }
    
    dragStartIndex = -1;
    return false;
}

function handleWsDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    return false;
}
function handleWsDragEnter(e) {
    this.classList.add('drag-over-ws');
}
function handleWsDragLeave(e) {
    if (!this.contains(e.relatedTarget)) {
        this.classList.remove('drag-over-ws');
    }
}
function handleWsDrop(e) {
    e.stopPropagation();
    this.classList.remove('drag-over-ws');
    const destCategory = this.dataset.category;
    if (dragStartIndex === -1) return;
    
    const draggedTool = tools[dragStartIndex];
    
    if (draggedTool.category !== destCategory) {
        draggedTool.category = destCategory;
        
        tools.splice(dragStartIndex, 1);
        tools.push(draggedTool);

        fetch(`${API_URL}/tools/${draggedTool.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(draggedTool)
        });

        fetch(`${API_URL}/tools/reorder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order: tools.map(t => t.id) })
        }).then(() => renderTools());
    }
}

function openAddModal(wsName = 'Geral') {
    document.getElementById('toolId').value = '';
    document.getElementById('toolName').value = '';
    document.getElementById('toolDir').value = '';
    document.getElementById('toolCommand').value = '';
    document.getElementById('toolCategory').value = wsName;
    document.getElementById('toolHotkey').value = '';
    document.getElementById('toolAutoStart').checked = false;
    document.getElementById('toolAutoPort').checked = false;
    document.getElementById('addModal').classList.add('active');
    
    // Forçar pin durante a edição
    if (window.api && window.api.toggleAlwaysOnTop) {
        window.api.toggleAlwaysOnTop(true);
    }
}

function openEditModal(id) {
    const tool = tools.find(t => t.id === id);
    if (!tool) return;
    
    document.getElementById('toolId').value = tool.id;
    document.getElementById('toolName').value = tool.name || '';
    document.getElementById('toolDir').value = tool.directory || '';
    document.getElementById('toolCommand').value = tool.command || '';
    document.getElementById('toolHotkey').value = tool.hotkey || '';
    document.getElementById('toolAutoStart').checked = tool.auto_start || false;
    document.getElementById('toolAutoPort').checked = tool.auto_port || false;
    document.getElementById('addModal').classList.add('active');
    
    // Forçar pin durante a edição
    if (window.api && window.api.toggleAlwaysOnTop) {
        window.api.toggleAlwaysOnTop(true);
    }
}

function closeAddModal() {
    if (isRecordingHotkey) toggleHotkeyRecord();
    document.getElementById('addModal').classList.remove('active');
    
    // Reverter para o estado original do pin
    if (window.api && window.api.toggleAlwaysOnTop) {
        window.api.toggleAlwaysOnTop(isPinned);
    }
}

let isRecordingHotkey = false;

function toggleHotkeyRecord() {
    const btn = document.getElementById('recordHotkeyBtn');
    const input = document.getElementById('toolHotkey');
    
    if (isRecordingHotkey) {
        isRecordingHotkey = false;
        btn.innerText = "Gravar";
        btn.style.color = "var(--text-primary)";
        btn.style.borderColor = "rgba(255,255,255,0.1)";
        input.placeholder = "Nenhum atalho definido";
        document.removeEventListener('keydown', hotkeyListener);
    } else {
        isRecordingHotkey = true;
        btn.innerText = "Parar";
        btn.style.color = "var(--danger)";
        btn.style.borderColor = "rgba(255,74,74,0.3)";
        input.value = "";
        input.placeholder = "Pressione as teclas...";
        document.addEventListener('keydown', hotkeyListener);
    }
}

function clearHotkey() {
    document.getElementById('toolHotkey').value = "";
    if (isRecordingHotkey) toggleHotkeyRecord();
}

function hotkeyListener(e) {
    e.preventDefault();
    e.stopPropagation();
    
    let keys = [];
    if (e.ctrlKey) keys.push("CommandOrControl");
    if (e.altKey) keys.push("Alt");
    if (e.shiftKey) keys.push("Shift");
    if (e.metaKey) keys.push("Super");
    
    const ignoredKeys = ["Control", "Shift", "Alt", "Meta", "Dead"];
    
    if (!ignoredKeys.includes(e.key)) {
        let keyStr = e.key;
        
        const keyMap = {
            "ArrowUp": "Up",
            "ArrowDown": "Down",
            "ArrowLeft": "Left",
            "ArrowRight": "Right",
            " ": "Space",
            "Enter": "Return"
        };
        
        if (keyMap[keyStr]) {
            keyStr = keyMap[keyStr];
        } else if (keyStr.length === 1) {
            keyStr = keyStr.toUpperCase();
        } else {
            keyStr = keyStr.charAt(0).toUpperCase() + keyStr.slice(1);
        }
        
        keys.push(keyStr);
        
        document.getElementById('toolHotkey').value = keys.join("+");
        toggleHotkeyRecord();
    }
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
    const id = document.getElementById('toolId').value;
    const name = document.getElementById('toolName').value;
    const dir = document.getElementById('toolDir').value;
    const cmd = document.getElementById('toolCommand').value;
    const hotkey = document.getElementById('toolHotkey').value;
    const auto_start = document.getElementById('toolAutoStart').checked;
    const auto_port = document.getElementById('toolAutoPort').checked;
    const category = document.getElementById('toolCategory').value;

    if (!name || !cmd) return;

    const payload = { name, command: cmd, directory: dir, hotkey, auto_start, auto_port, category };

    try {
        const url = id ? `${API_URL}/tools/${id}` : `${API_URL}/tools`;
        const method = id ? 'PUT' : 'POST';
        
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        tools = await res.json();
        renderTools();
        closeAddModal();
    } catch(e) { console.error(e); }
}

function removeTool(id) {
    customConfirm("Tem certeza que deseja excluir esta ferramenta?", async () => {
        try {
            const res = await fetch(`${API_URL}/tools/${id}`, { method: 'DELETE' });
            tools = await res.json();
            renderTools();
        } catch(e) {}
    });
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

function openLogsModal(id, name) {
    activeLogsToolId = id;
    document.getElementById('logsToolName').innerText = name;
    document.getElementById('logsConsole').innerText = 'Carregando logs...';
    document.getElementById('logsModal').classList.add('active');
    
    fetchLogs();
    logsInterval = setInterval(fetchLogs, 1000);
}

function closeLogsModal() {
    activeLogsToolId = null;
    if (logsInterval) clearInterval(logsInterval);
    document.getElementById('logsModal').classList.remove('active');
}

async function fetchLogs() {
    if (!activeLogsToolId) return;
    try {
        const res = await fetch(`${API_URL}/tools/${activeLogsToolId}/logs`);
        if (res.ok) {
            const data = await res.json();
            const consoleEl = document.getElementById('logsConsole');
            
            // Check if user is scrolled to bottom
            const isScrolledToBottom = Math.abs((consoleEl.scrollHeight - consoleEl.clientHeight) - consoleEl.scrollTop) < 5;
            
            const rawLog = data.join('') || 'Sem logs disponíveis.';
            consoleEl.innerHTML = parseLogColors(rawLog);
            
            if (isScrolledToBottom) {
                consoleEl.scrollTop = consoleEl.scrollHeight;
            }
        }
    } catch(e) {}
}

function escapeHtml(unsafe) {
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function parseLogColors(rawText) {
    let text = escapeHtml(rawText);
    
    // ANSI regex parsing
    text = text.replace(/\x1b\[(\d+(?:;\d+)*)m/g, (match, p1) => {
        if (p1 === '0') return '</span>';
        if (p1.includes('31')) return '<span style="color: #ff4a4a;">';
        if (p1.includes('32')) return '<span style="color: #00ffaa;">';
        if (p1.includes('33')) return '<span style="color: #ffd700;">';
        if (p1.includes('34')) return '<span style="color: #00e5ff;">';
        if (p1.includes('35')) return '<span style="color: #ff00ff;">';
        if (p1.includes('36')) return '<span style="color: #00ffff;">';
        return '<span>'; // Unknown code
    });
    
    // Keyword regex highlighting line by line
    const lines = text.split('\n');
    return lines.map(line => {
        // Se a linha já tiver formatação ANSI forte (ex: span color), não sobrescrevemos a linha toda grosseiramente
        if (line.includes('<span style')) return line;
        
        if (/(error|exception|fail)/i.test(line)) {
            return `<span style="color: #ff4a4a; font-weight: bold;">${line}</span>`;
        }
        if (/(warn|aviso)/i.test(line)) {
            return `<span style="color: #ffd700;">${line}</span>`;
        }
        if (/(info|success|ok|iniciando)/i.test(line)) {
            return `<span style="color: #00ffaa;">${line}</span>`;
        }
        return line;
    }).join('\n');
}

async function clearLogsTool() {
    if (!activeLogsToolId) return;
    try {
        await fetch(`${API_URL}/tools/${activeLogsToolId}/logs`, { method: 'DELETE' });
        document.getElementById('logsConsole').innerHTML = '';
    } catch(e) {}
}

async function downloadLogsTool() {
    if (!activeLogsToolId) return;
    try {
        const res = await fetch(`${API_URL}/tools/${activeLogsToolId}/logs`);
        if (res.ok) {
            const data = await res.json();
            const text = data.join('');
            const blob = new Blob([text], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const toolName = document.getElementById('logsToolName').innerText || 'log';
            a.href = url;
            a.download = `logs_${toolName.replace(/\s+/g, '_')}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    } catch(e) {}
}

setInterval(loadTools, 2000);
loadTools();

// Prevenir que o Electron tente abrir o arquivo como um navegador
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

// Smart Drag and Drop para o Modal de Adicionar
const addModalEl = document.getElementById('addModal');
if (addModalEl) {
    const modalInner = addModalEl.querySelector('.modal');
    
    addModalEl.addEventListener('dragover', (e) => {
        if (!addModalEl.classList.contains('active')) return;
        e.preventDefault();
        e.stopPropagation();
        if (modalInner) modalInner.style.boxShadow = '0 0 40px rgba(0, 229, 255, 0.6)';
    });

    addModalEl.addEventListener('dragleave', (e) => {
        if (!addModalEl.classList.contains('active')) return;
        e.preventDefault();
        e.stopPropagation();
        if (modalInner) modalInner.style.boxShadow = '';
    });

    addModalEl.addEventListener('drop', (e) => {
        if (!addModalEl.classList.contains('active')) return;
        e.preventDefault();
        e.stopPropagation();
        if (modalInner) modalInner.style.boxShadow = '';
        
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            const filePath = window.api && window.api.getPathForFile ? window.api.getPathForFile(file) : file.path;
            
            if (!filePath) return; // Algumas vezes o drag de atalhos pode não passar o path direto, mas no Electron desktop geralmente passa.
            
            // Heurística básica: Se tem extensão depois da última barra, é arquivo.
            const isFile = filePath.lastIndexOf('.') > Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'));
            
            if (isFile) {
                document.getElementById('toolCommand').value = filePath;
                
                // Extrai o diretório (tudo antes da última barra)
                const lastSlash = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'));
                const dirPath = filePath.substring(0, lastSlash);
                if (dirPath) {
                    document.getElementById('toolDir').value = dirPath;
                }
                
                // Preenche o nome se estiver vazio
                if (!document.getElementById('toolName').value) {
                    let name = filePath.substring(lastSlash + 1, filePath.lastIndexOf('.'));
                    name = name.charAt(0).toUpperCase() + name.slice(1);
                    document.getElementById('toolName').value = name;
                }
            } else {
                // É uma pasta
                document.getElementById('toolDir').value = filePath;
                
                if (!document.getElementById('toolName').value) {
                    const lastSlash = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'));
                    let name = filePath.substring(lastSlash + 1);
                    name = name.charAt(0).toUpperCase() + name.slice(1);
                    document.getElementById('toolName').value = name;
                }
            }
        }
    });
}

async function toggleWorkspace(name, action, btnEl) {
    if (btnEl) {
        btnEl.disabled = true;
        btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    }
    try {
        await fetch(`${API_URL}/workspaces/${encodeURIComponent(name)}/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action })
        });
        loadTools();
    } catch(e) {}
}

function openWsHotkeyModal(name) {
    document.getElementById('wsHotkeyName').innerText = name;
    document.getElementById('wsHotkeyOriginalName').value = name;
    const ws = workspaces[name] || {};
    document.getElementById('wsHotkeyInput').value = ws.hotkey || '';
    document.getElementById('wsHotkeyModal').classList.add('active');
}

function closeWsHotkeyModal() {
    document.getElementById('wsHotkeyModal').classList.remove('active');
}

let isRecordingWsHotkey = false;
let wsHotkeyKeys = [];

function toggleWsHotkeyRecord() {
    isRecordingWsHotkey = !isRecordingWsHotkey;
    const btn = document.getElementById('recordWsHotkeyBtn');
    const input = document.getElementById('wsHotkeyInput');
    
    if (isRecordingWsHotkey) {
        btn.innerText = 'Parar';
        btn.style.color = '#fff';
        btn.style.background = 'var(--danger)';
        input.value = 'Pressione teclas...';
        wsHotkeyKeys = [];
        window.addEventListener('keydown', handleWsHotkeyPress);
    } else {
        btn.innerText = 'Gravar';
        btn.style.color = '';
        btn.style.background = 'rgba(255,255,255,0.05)';
        window.removeEventListener('keydown', handleWsHotkeyPress);
        if (wsHotkeyKeys.length > 0) {
            saveWsHotkey(wsHotkeyKeys.join("+"));
        } else {
            const name = document.getElementById('wsHotkeyOriginalName').value;
            const ws = workspaces[name] || {};
            input.value = ws.hotkey || '';
        }
    }
}

function handleWsHotkeyPress(e) {
    e.preventDefault();
    if (!wsHotkeyKeys.includes(e.key) && e.key !== 'Escape') {
        let keyStr = e.key;
        if (keyStr === 'Control') keyStr = 'CommandOrControl';
        else if (keyStr === ' ') keyStr = 'Space';
        else if (keyStr.length === 1) keyStr = keyStr.toUpperCase();
        else keyStr = keyStr.charAt(0).toUpperCase() + keyStr.slice(1);
        
        wsHotkeyKeys.push(keyStr);
        document.getElementById('wsHotkeyInput').value = wsHotkeyKeys.join("+");
        toggleWsHotkeyRecord();
    }
}

async function saveWsHotkey(hotkeyStr) {
    const name = document.getElementById('wsHotkeyOriginalName').value;
    try {
        const res = await fetch(`${API_URL}/workspaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, hotkey: hotkeyStr })
        });
        workspaces = await res.json();
        renderTools();
    } catch(e) {}
}

async function clearWsHotkey() {
    const name = document.getElementById('wsHotkeyOriginalName').value;
    document.getElementById('wsHotkeyInput').value = '';
    try {
        const res = await fetch(`${API_URL}/workspaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, hotkey: '' })
        });
        workspaces = await res.json();
        renderTools();
    } catch(e) {}
}

function openAddWsModal() {
    document.getElementById('addWsModal').classList.add('active');
    document.getElementById('wsNameInput').value = '';
    setTimeout(() => document.getElementById('wsNameInput').focus(), 100);
}

function closeAddWsModal() {
    document.getElementById('addWsModal').classList.remove('active');
}

async function createWorkspace() {
    const name = document.getElementById('wsNameInput').value.trim();
    if (!name) return;
    try {
        const res = await fetch(`${API_URL}/workspaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        if(res.ok) {
            workspaces = await res.json();
            closeAddWsModal();
            renderTools();
        }
    } catch(e) {
        console.error("Error creating workspace", e);
    }
}
// Setup event listeners for new modals
document.addEventListener('DOMContentLoaded', () => {
    const confirmBtn = document.getElementById('confirmOkBtn');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            closeConfirmModal();
            if (confirmCallback) confirmCallback();
        });
    }

    const promptOkBtn = document.getElementById('promptOkBtn');
    if (promptOkBtn) {
        promptOkBtn.addEventListener('click', () => {
            const val = document.getElementById('promptInput').value;
            closePromptModal();
            if (promptCallback) promptCallback(val);
        });
    }

    const promptInput = document.getElementById('promptInput');
    if (promptInput) {
        promptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('promptOkBtn').click();
            if (e.key === 'Escape') closePromptModal();
        });
    }
});
