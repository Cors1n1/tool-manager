document.addEventListener('DOMContentLoaded', async () => {
    const envContent = await window.api.readEnv();
    const list = document.getElementById('env-list');
    
    if (envContent) {
        const lines = envContent.split('\n');
        lines.forEach(line => {
            line = line.trim();
            if (line && !line.startsWith('#')) {
                const eqIdx = line.indexOf('=');
                if (eqIdx !== -1) {
                    const key = line.substring(0, eqIdx).trim();
                    let val = line.substring(eqIdx + 1).trim();
                    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                        val = val.substring(1, val.length - 1);
                    }
                    addEnvRow(key, val);
                }
            }
        });
    }
    
    if (list.children.length === 0) {
        addEnvRow('', ''); 
    }
});

function addEnvRow(key = '', val = '') {
    const list = document.getElementById('env-list');
    const row = document.createElement('div');
    row.className = 'env-row';
    
    row.innerHTML = `
        <input type="text" class="env-key" placeholder="CHAVE_NOME" value="${key.replace(/"/g, '&quot;')}">
        <span style="color: var(--text-dim); font-weight: bold;">=</span>
        <input type="text" class="env-val" placeholder="Valor" value="${val.replace(/"/g, '&quot;')}">
        <button class="btn danger" onclick="this.parentElement.remove()" title="Remover"><i class="fa-solid fa-trash"></i></button>
    `;
    list.appendChild(row);
}

async function saveEnvFile() {
    const statusMsg = document.getElementById('status-msg');
    statusMsg.innerText = 'Salvando...';
    statusMsg.style.color = 'var(--text-dim)';
    
    const list = document.getElementById('env-list');
    const rows = list.querySelectorAll('.env-row');
    let content = '';
    
    rows.forEach(row => {
        const key = row.querySelector('.env-key').value.trim();
        const val = row.querySelector('.env-val').value.trim();
        if (key) {
            content += `${key}="${val}"\n`;
        }
    });
    
    const success = await window.api.saveEnv(content);
    if (success) {
        statusMsg.innerText = 'Salvo com sucesso!';
        statusMsg.style.color = 'var(--accent)';
        setTimeout(() => { statusMsg.innerText = ''; }, 3000);
    } else {
        statusMsg.innerText = 'Erro ao salvar!';
        statusMsg.style.color = '#ff4a4a';
    }
}

// --- App Hotkey Logic ---
document.addEventListener('DOMContentLoaded', () => {
    const hk = localStorage.getItem('appHotkey') || '';
    document.getElementById('appHotkeyInput').value = hk;
});

let isRecordingAppHotkey = false;
function toggleAppHotkeyRecord() {
    isRecordingAppHotkey = !isRecordingAppHotkey;
    const btn = document.getElementById('recordAppHotkeyBtn');
    const input = document.getElementById('appHotkeyInput');
    
    if (isRecordingAppHotkey) {
        btn.innerText = 'Gravando...';
        btn.style.color = 'var(--danger)';
        input.value = '';
        input.placeholder = 'Pressione as teclas...';
    } else {
        btn.innerText = 'Gravar';
        btn.style.color = 'var(--text-primary)';
        input.placeholder = 'Nenhum atalho';
    }
}

function clearAppHotkey() {
    document.getElementById('appHotkeyInput').value = '';
    saveAppHotkey('');
}

function saveAppHotkey(hk) {
    localStorage.setItem('appHotkey', hk);
    if (window.api && window.api.updateAppHotkey) {
        window.api.updateAppHotkey();
    }
}

document.addEventListener('keydown', (e) => {
    if (isRecordingAppHotkey) {
        e.preventDefault();
        const keys = [];
        if (e.ctrlKey) keys.push('CommandOrControl');
        if (e.altKey) keys.push('Alt');
        if (e.shiftKey) keys.push('Shift');
        
        let key = e.key;
        if (key === 'Control' || key === 'Alt' || key === 'Shift' || key === 'Meta') return;
        if (key.length === 1) key = key.toUpperCase();
        
        keys.push(key);
        const hotkeyStr = keys.join('+');
        document.getElementById('appHotkeyInput').value = hotkeyStr;
        toggleAppHotkeyRecord();
        saveAppHotkey(hotkeyStr);
    }
});

// --- Startup Logic ---
document.addEventListener('DOMContentLoaded', async () => {
    if (window.api && window.api.getStartupState) {
        const isStartup = await window.api.getStartupState();
        document.getElementById('startupCheckbox').checked = isStartup;
    }
});

async function toggleStartup(isChecked) {
    if (window.api && window.api.toggleStartupState) {
        await window.api.toggleStartupState(isChecked);
    }
}
