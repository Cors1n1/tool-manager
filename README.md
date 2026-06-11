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
├── ui              # Frontend (HTML, CSS, JS)
├── .gitignore      # Arquivos ignorados pelo Git
├── README.md       # Documentação do projeto
├── backend.py      # Servidor Flask (Gerenciamento de processos e logs)
├── config.json     # Persistência de dados (Configurações das ferramentas)
├── icon.ico        # Ícone da aplicação
├── main.js         # Processo principal do Electron
├── package-lock.json
├── package.json    # Dependências Node.js
└── preload.js      # Ponte entre Electron e renderizador
```

## Dependências

* **Backend**: `flask`, `flask-cors`, `psutil`.
* **Frontend**: `electron`.

## Como utilizar

1. O ícone aparecerá na bandeja do sistema após a execução.
2. Clique no ícone para alternar a visibilidade da janela.
3. Utilize a interface para adicionar o caminho do executável, configurar variáveis de ambiente e definir categorias.
4. O sistema irá gerenciar automaticamente a alocação de portas caso a opção `auto_port` esteja ativa.
5. Acesse a aba de logs para depuração de processos em execução e o painel de sistema para verificar o consumo de hardware.

## 📋 Histórico de Atualizações

### 🔄 Atualização (11/06/2026)
- Implementado sistema de monitoramento de recursos do sistema (CPU/RAM/Disk).
- Adicionada funcionalidade de alocação dinâmica de portas para processos.
- Adicionado sistema de captura de logs em tempo real por ferramenta.
- Implementado suporte a variáveis de ambiente (env_vars) e reordenação de ferramentas.
- Melhorias na edição e gerenciamento de metadados das ferramentas (categorias, hotkeys).
