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
* **Autostart Nativo**: Gerenciamento de inicialização automática com o Windows via interface.

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
├── ToolManager.exe
├── backend.py
├── config.json
├── icon.ico
├── icon.png
├── main.js
├── package-lock.json
├── package.json
├── preload.js
├── spotify-browser-preload.js
└── spotify_token.json
```

## Dependências

* **Backend**: `flask`, `flask-cors`, `psutil`, `requests`, `python-dotenv`.
* **Frontend**: `electron`, `chrome-paths` (^1.0.1), `puppeteer-core` (^25.1.0).

## Como utilizar

1. O ícone aparecerá na bandeja do sistema após a execução.
2. Clique no ícone para alternar a visibilidade da janela.
3. Utilize a interface para adicionar o caminho do executável, configurar variáveis de ambiente e definir categorias.
4. O menu de contexto da bandeja (clique com botão direito no ícone) exibe o status em tempo real de suas ferramentas.
5. Acesse o editor de variáveis via interface para configurar o arquivo `.env` sem editar arquivos manualmente.
6. Gerencie a inicialização automática do software através da aba de configurações (ícone de engrenagem).

## 📋 Histórico de Atualizações

### 🔄 Atualização (21/09/2026)
- Melhoria no sistema de execução de processos no Windows: Implementada injeção automática de `cmd.exe /c` para arquivos `.bat` e `.cmd`.
- Ajuste de robustez para caminhos no Windows: Adicionado tratamento de escape para barras invertidas (`\\`) evitando falhas no `shlex`.
- Atualização do `.gitignore`: Adicionada regra para ignorar arquivos de atalho (`.lnk`).
- Atualização do `config.json`: Inclusão de novas ferramentas de automação (Cerebro, Sound Pad, Emprego, DuckDNS, Wifi).

### 🔄 Atualização (12/06/2026)
- Implementado suporte a auto-start: Adicionado `toggle-startup-state` e `get-startup-state` via IPC no `main.js` para gerenciar atalhos na pasta Inicializar do Windows.
- Atualização do monitoramento de CPU no `backend.py`: Ajustado intervalo do `psutil` para 0.1s para leituras mais precisas.
- Refatoração na execução de ferramentas: Adicionada lógica de resolução de caminhos (`exe_path`) para garantir que executáveis sejam encontrados corretamente a partir do diretório de trabalho.
- Atualização de interface: Adicionado botão de copiar logs no modal e novas abas (Workspaces/Soltas) no `index.html`.
- Atualização da configuração padrão (`config.json`): Adicionados novos exemplos de ferramentas e grupos de Workspace.

### 🔄 Atualização (12/06/2026)
- Oti
... [readme truncado]
