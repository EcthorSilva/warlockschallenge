const { loadPlayerState, deletePlayerState } = require('../lib/playerState');
const { INTRO_TEXTS } = require('../lib/gameLoader');
const { buildPlayerSheetMessage } = require('../lib/messageBuilder');

// Função auxiliar para exibir o menu principal
function displayMainMenu(chatId, bot) {
    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "Começar a Jornada", callback_data: "start_journey" }],
                [{ text: "Boatos", callback_data: "rumors" }]
            ]
        },
        parse_mode: "Markdown"
    };
    bot.sendMessage(chatId, INTRO_TEXTS.welcomeMessage, options);
}

function registerCommandHandlers(bot) {
    // Comando /start para iniciar a conversa
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        displayMainMenu(chatId, bot);
    });

    // Comando /reset para apagar o jogo e recomeçar
    bot.onText(/\/reset/, (msg) => {
        const chatId = msg.chat.id;
        if (deletePlayerState(chatId)) {
            bot.sendMessage(chatId, INTRO_TEXTS.resetGameConfirm);
        } else {
            bot.sendMessage(chatId, "Não havia um jogo ativo para ser reiniciado. Digite /start para começar uma nova aventura!");
        }
    });

    // Comando /help para exibir a ajuda
    bot.onText(/\/help/, (msg) => {
        const chatId = msg.chat.id;
        bot.sendMessage(chatId, INTRO_TEXTS.helpMessage, { parse_mode: "Markdown" });
    });

    // Comando /instruções para exibir as regras do jogo
    bot.onText(/\/instruções/, (msg) => {
        const chatId = msg.chat.id;
        bot.sendMessage(chatId, INTRO_TEXTS.instructionsMessage, { parse_mode: "Markdown" });
    });

    // Comando /ficha para exibir a ficha do personagem
    bot.onText(/\/ficha/, (msg) => {
        const chatId = msg.chat.id;
        const playerState = loadPlayerState(chatId);

        // Verifica se um jogo está em andamento (se os atributos foram gerados)
        if (playerState && playerState.attributes && playerState.attributes.habilidadeInicial) {
            const sheetMessage = buildPlayerSheetMessage(playerState);
            bot.sendMessage(chatId, sheetMessage, { parse_mode: "Markdown" });
        } else {
            bot.sendMessage(chatId, "Nenhum jogo em andamento. Digite /start para criar seu personagem.");
        }
    });

    // Lida com mensagens de texto do usuário que não são comandos
    bot.on('message', (msg) => {
        const chatId = msg.chat.id;
        const messageText = msg.text ? msg.text.toLowerCase() : '';

        if (messageText.startsWith('/')) {
            return;
        }

        // Para qualquer outra mensagem de texto que não seja um comando,
        // o bot informa ao usuário que a interação é por botões ou comandos.
        bot.sendMessage(chatId, INTRO_TEXTS.common.invalidChoice);
    });
}

module.exports = {
    registerCommandHandlers,
    displayMainMenu
};