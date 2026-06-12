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
