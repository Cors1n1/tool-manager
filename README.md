# Tool Manager

O Tool Manager é um gerenciador de ferramentas desktop que permite organizar, iniciar e encerrar processos externos diretamente de uma interface centralizada na bandeja do sistema.

## Características

* **Gerenciamento de Processos**: Inicie e interrompa ferramentas ou scripts via interface.
* **Monitoramento**: Suporta visualização de logs em tempo real e status de execução.
* **Integração Desktop**: Funciona nativamente como um ícone na bandeja do sistema (Tray).
* **Configuração Dinâmica**: Permite adicionar novos comandos, categorias, variáveis de ambiente e hotkeys.
* **Automação de Rede**: Atribuição automática de portas livres para processos que necessitam.
* **Resolução Inteligente**: Suporta atalhos `.lnk` (Windows), resolvendo automaticamente argumentos e diretórios de trabalho.
* **Monitoramento de Recursos**: Painel de visualização de uso de CPU, memória e discos.
* **Personalização Visual**: Suporte a múltiplos temas de cores (vibes) via menu de interface.
* **Gerenciamento de Workspaces**: Agrupamento lógico de ferramentas com controle em lote (iniciar/parar todo o grupo).
* **Integração Spotify**: Suporte nativo para controle de player via API e Web Playback SDK (Headless).
* **Editor de Variáveis**: Interface dedicada para gerenciamento de variáveis de ambiente (`.env`).

## Instalação e Configuração

A instalação e a configuração deste projeto são **AUTOMÁTICAS**.

1. O sistema gerencia os arquivos de configuração `config.json`, `spotify_token.json` e `.env` de forma autônoma. Caso não existam, o backend os criará automaticamente na primeira execução.
2. Certifique-se de possuir o **Python** (com bibliotecas `flask`, `flask-cors`, `psutil`, `requests`, `python-dotenv`) e o **Node.js** instalados.
3. Para iniciar a aplicação, basta executar:
   ```bash
   npm install
   npm start
   ```

## Estrutura do Projeto

```text
.
├── ui
│   ├── env.html
│   ├── env.js
│   ├── index.html
│   ├── renderer.js
│   ├── spotify-browser.html
│   ├── spotify-browser.js
│   ├── spotify-headless.html
│   └── style.css
├── .env
├── .gitignore
├── README.md
├── backend.py
├── config.json
├── icon.ico
├── main.js
├── package-lock.json
├── package.json
├── preload.js
├── spotify-browser-preload.js
└── spotify_token.json
```

## Dependências

* **Backend**: `flask`, `flask-cors`, `psutil`, `requests`, `python-dotenv`.
* **Frontend**: `electron`, `chrome-paths`, `puppeteer-core` (^25.1.0).

## Como utilizar

1. O ícone aparecerá na bandeja do sistema após a execução.
2. Clique no ícone para alternar a visibilidade da janela.
3. Utilize a interface para adicionar o caminho do executável, configurar variáveis de ambiente e definir categorias.
4. O menu de contexto da bandeja (clique com botão direito no ícone) exibe o status em tempo real de suas ferramentas.
5. Acesse o editor de variáveis via interface para configurar o arquivo `.env` sem editar arquivos manualmente.
6. Para o Spotify, utilize a seção de autenticação nas configurações para conectar sua conta e habilitar o player integrado.

## 📋 Histórico de Atualizações

### 🔄 Atualização (12/06/2026)
- Otimização do backend: Adicionado `logging` silencioso e refatoração da autenticação Spotify para usar `Basic Auth` em headers.
- Melhoria no sistema de monitoramento: `psutil` configurado para não bloquear a thread principal; cache de disco implementado com expiração de 60s.
- Atualização do `main.js`: Implementado estado de persistência para "Always on Top" e suporte a alternância da janela via hotkey global.
- Refatoração do `main.js` para garantir que o processo Python seja iniciado silenciosamente (`stdio: 'ignore'`).

### 🔄 Atualização (11/06/2026)
- Implementado sistema de edição de variáveis de ambiente (`.env`) com interface dedicada e comunicação IPC segura.
- Adicionados arquivos `ui/env.html` e `ui/env.js`.
- Atualizado `main.js` com novos handlers `read-env`, `save-env` e `open-env-editor`.
- Atualizado `preload.js` para expor métodos de gerenciamento de ambiente.
- Atualizado token do Spotify e escopos de acesso no `spotify_token.json`.

### 🔄 Atualização (11/06/2026)
- Implementada integração total com Spotify API: autenticação via OAuth, renovação automática de tokens e endpoints de proxy para controle de player.
- Adicionado sistema de "Headless Player" via Puppeteer para reprodução integrada.
- Adicionados arquivos de interface (`spotify-browser.html`, `spotify-headless.html`) e preloads dedicados.
- Expansão do `backend.py` para gerenciar endpoints do Spotify e estados de dispositivo.
