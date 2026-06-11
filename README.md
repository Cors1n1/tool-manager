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

## Instalação e Configuração

A instalação e a configuração deste projeto são **AUTOMÁTICAS**.

1. O sistema gerencia o arquivo de configuração `config.json` de forma autônoma. Caso o arquivo não exista, o backend o criará automaticamente na primeira execução.
2. Certifique-se de possuir o **Python** (com bibliotecas `flask`, `flask-cors`, `psutil`) e o **Node.js** instalados.
3. Para iniciar a aplicação, basta executar:
   ```bash
   npm install
   npm start
   ```

## Estrutura do Projeto

```text
.
├── ui
│   ├── index.html
│   ├── renderer.js
│   └── style.css
├── .gitignore
├── README.md
├── backend.py
├── config.json
├── icon.ico
├── main.js
├── package-lock.json
├── package.json
└── preload.js
```

## Dependências

* **Backend**: `flask`, `flask-cors`, `psutil`.
* **Frontend**: `electron`.

## Como utilizar

1. O ícone aparecerá na bandeja do sistema após a execução.
2. Clique no ícone para alternar a visibilidade da janela.
3. Utilize a interface para adicionar o caminho do executável, configurar variáveis de ambiente e definir categorias.
4. O menu de contexto da bandeja (clique com botão direito no ícone) agora exibe o status em tempo real de suas ferramentas (🟢 rodando / ⭕ parado).
5. Personalize a aparência da interface utilizando o botão de paleta de cores no topo da janela.
6. Gerencie seus projetos através da aba de Workspaces, permitindo ligar/desligar conjuntos inteiros de ferramentas com um clique.

## 📋 Histórico de Atualizações

### 🔄 Atualização (11/06/2026)
- Implementada funcionalidade de "Parar Tudo" (Stop All) tanto no menu da bandeja quanto via backend.
- Adicionada atualização em tempo real do tooltip da bandeja com o uso atual de CPU e RAM.
- Adicionado campo `health_check_url` no `config.json` para futuras validações de serviços.
- Melhorada a comunicação IPC para eventos de controle em lote, otimizando a responsividade da UI.

### 🔄 Atualização (11/06/2026)
- Implementado sistema completo de **Workspaces**: agora é possível criar grupos, renomear, deletar e controlar ferramentas em lote (iniciar/parar todas do grupo).
- Refatoração do `backend.py` para incluir endpoints de gerenciamento de workspaces e melhorias no tratamento de logs (limpeza e persistência).
- Aprimorado o mecanismo de encerramento de processos (`stop_tool`) utilizando `taskkill` com tratamento assíncrono para evitar bloqueios na UI.
- Ajuste na busca de portas livres (`find_free_port`) para evitar conflitos de atribuição em execuções rápidas.
- Adicionada integração de logs entre console do Electron e interface.

### 🔄 Atualização (11/06/2026)
- Adicionado menu de contexto dinâmico na bandeja do sistema (Tray) que reflete o estado atual das ferramentas.
- Implementado sistema de seleção de temas (vibes) com persistência via `localStorage`.
- Otimização do processo de renderização e comunicação IPC para atualização do menu da bandeja.

### 🔄 Atualização (01/06/2026)
- Implementado sistema de monitoramento de recursos do sistema (CPU/RAM/Disk).
- Adicionada funcionalidade de alocação dinâmica de portas para processos.
- Adicionado sistema de captura de logs em tempo real por ferramenta.
- Implementado suporte a variáveis de ambiente (env_vars) e reordenação de ferramentas.
- Melhorias na edição e gerenciamento de metadados das ferramentas.
