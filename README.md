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
* **Mixer de Áudio**: Controle de volume e mudo de processos individuais via integração com `pycaw`.

## Instalação e Configuração

A instalação e a configuração deste projeto são **AUTOMÁTICAS**.

1. O sistema gerencia os arquivos de configuração `config.json`, `spotify_token.json` e `.env` de forma autônoma. Caso não existam, o backend os criará automaticamente na primeira execução.
2. Certifique-se de possuir o **Python** (com bibliotecas `flask`, `flask-cors`, `psutil`, `requests`, `python-dotenv`, `pycaw`) e o **Node.js** instalados.
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
├── spotify_token.json
└── window-snapper.js
```

## Dependências

* **Backend**: `flask`, `flask-cors`, `psutil`, `requests`, `python-dotenv`, `pycaw`, `comtypes`.
* **Frontend**: `electron`, `chrome-paths` (^1.0.1), `puppeteer-core` (^25.1.0).

## Como utilizar

1. O ícone aparecerá na bandeja do sistema após a execução.
2. Clique no ícone para alternar a visibilidade da janela.
3. Utilize a interface para adicionar o caminho do executável, configurar variáveis de ambiente e definir categorias.
4. O menu de contexto da bandeja (clique com botão direito no ícone) exibe o status em tempo real de suas ferramentas.
5. Acesse o editor de variáveis via interface para configurar o arquivo `.env` sem editar arquivos manualmente.
6. Gerencie a inicialização automática do software através da aba de configurações (ícone de engrenagem).

## 📋 Histórico de Atualizações

### 🔄 Atualização (27/09/2026)
- Atualização do motor de comunicação do `main.js`: Adicionado broadcast de sincronização de limites (`bounds`) para o serviço de snapping.
- Otimização do `renderer.js`: Correções de codificação (caracteres especiais), melhorias na renderização de badges de porta e ajustes na UX da lista de ferramentas.
- Atualização do `config.json`: Adicionado o novo módulo "Monitor" às configurações de ferramentas.

### 🔄 Atualização (27/09/2026)
- Implementação de Mixer de Áudio: Adicionados endpoints no `backend.py` para listar, controlar volume e silenciar processos ativos utilizando a biblioteca `pycaw`.
- Integração de `window-snapper.js`: Adicionado módulo de gerenciamento de posicionamento de janelas e comunicação via TCP Broker.
- Atualização da estrutura do projeto: Adição de `window-snapper.js` e organização dos arquivos de interface.
- Atualização do `.gitignore`: Refinamento das regras de exclusão para incluir builds, logs e arquivos temporários de sistemas de desenvolvimento.

### 🔄 Atualização (21/09/2026)
- Melhoria no sistema de e
... [readme truncado]
