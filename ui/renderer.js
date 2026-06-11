const API_URL = 'http://localhost:5555';
let tools = [];
let previousState = {};
let activeLogsToolId = null;
let logsInterval = null;
let isPinned = localStorage.getItem('isPinned') === 'true';

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
            document.getElementById('dashCpu').innerText = `${data.cpu_percent.toFixed(1)}%`;
            document.getElementById('dashRam').innerText = `${data.memory.percent.toFixed(1)}%`;
            
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

// Global toggle trigger from hotkeys
if (window.api && window.api.onTriggerToggle) {
    window.api.onTriggerToggle((event, toolId) => {
        toggleTool(toolId);
    });
}

async function loadTools() {
    try {
        const res = await fetch(`${API_URL}/tools`);
        if(res.ok) {
            tools = await res.json();
            
            // Check for state changes for notifications
            let shortcutsMap = {};
            tools.forEach(t => {
                if (t.hotkey) shortcutsMap[t.hotkey] = t.id;
                
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
            
            if (window.api && window.api.registerShortcuts) {
                window.api.registerShortcuts(shortcutsMap);
            }
            
            renderTools();
        }
    } catch(e) {
        // Backend not ready or offline
    }
}

let dragStartIndex = -1;

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

    tools.forEach((tool, index) => {
        const item = document.createElement('div');
        item.className = 'tool-item';
        item.draggable = true;
        item.dataset.id = tool.id;
        item.dataset.index = index;
        
        // Drag events
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
            <div class="tool-info" title="${tool.command}">
                <i class="fa-solid fa-grip-vertical" style="color: var(--border); margin-right: 8px; cursor: grab; font-size: 14px;"></i>
                ${statusDot}
                <div class="tool-name">${tool.name}</div>
                ${portBadge}
            </div>
            <div class="tool-actions">
                <button class="action-btn hover-only" onclick="openLogsModal('${tool.id}', '${tool.name}')" title="Logs"><i class="fa-solid fa-terminal"></i></button>
                <button class="action-btn hover-only" onclick="openEditModal('${tool.id}')" title="Editar"><i class="fa-solid fa-pen"></i></button>
                <button class="action-btn delete hover-only" onclick="removeTool('${tool.id}')" title="Excluir"><i class="fa-solid fa-trash-can"></i></button>
                ${actionButtons}
            </div>
        `;
        container.appendChild(item);
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
        const movedItem = tools.splice(dragStartIndex, 1)[0];
        tools.splice(dragEndIndex, 0, movedItem);
        
        renderTools();
        
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

function openAddModal() {
    document.getElementById('toolId').value = '';
    document.getElementById('toolName').value = '';
    document.getElementById('toolDir').value = '';
    document.getElementById('toolCommand').value = '';
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

    if (!name || !cmd) return;

    const payload = { name, command: cmd, directory: dir, hotkey, auto_start, auto_port };

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
            
            consoleEl.innerText = data.logs.join('') || 'Sem logs disponíveis.';
            
            if (isScrolledToBottom) {
                consoleEl.scrollTop = consoleEl.scrollHeight;
            }
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
