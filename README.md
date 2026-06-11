# Tool Manager

O Tool Manager é um gerenciador de ferramentas desktop que permite organizar, iniciar e encerrar processos externos diretamente de uma interface centralizada na bandeja do sistema.

## Características

* **Gerenciamento de Processos**: Inicie e interrompa ferramentas ou scripts via interface.
* **Integração Desktop**: Funciona nativamente como um ícone na bandeja do sistema (Tray).
* **Configuração Dinâmica**: Permite adicionar novos comandos e diretórios.
* **Resolução Inteligente**: Suporta atalhos `.lnk` (Windows), resolvendo automaticamente argumentos e diretórios de trabalho.

## Instalação e Configuração

A instalação e a configuração deste projeto são **AUTOMÁTICAS**.

1. O sistema gerencia o arquivo de configuração `config.json` de forma autônoma. Caso o arquivo não exista ou esteja corrompido, o backend o criará automaticamente na primeira execução.
2. Certifique-se de possuir o **Python** e o **Node.js** instalados em seu ambiente.
3. Para iniciar a aplicação, basta executar o comando padrão do Electron:
   ```bash
   npm install
   npm start
   ```

## Arquitetura

* **Frontend**: Electron (Interface transparente e leve na bandeja).
* **Backend**: Flask (API local para controle de processos e gerenciamento de estados).
* **Armazenamento**: `config.json` local para persistência das ferramentas cadastradas.

## Como utilizar

1. O ícone aparecerá na bandeja do sistema após a execução.
2. Clique no ícone para alternar a visibilidade da janela.
3. Utilize a interface para adicionar o caminho do executável ou script desejado e o diretório de execução.
4. O botão de alternância (toggle) iniciará ou encerrará o processo conforme o estado atual.
