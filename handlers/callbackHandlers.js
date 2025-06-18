const { loadPlayerState, savePlayerState } = require('../lib/playerState');
const { rollDice } = require('../lib/diceRoller');
const { INTRO_TEXTS, GAME_HISTORY } = require('../lib/gameLoader');
const { displayMainMenu } = require('./commandHandlers');


function registerCallbackHandlers(bot) {
    bot.on('callback_query', (callbackQuery) => {
        const message = callbackQuery.message;
        const chatId = message.chat.id;
        const data = callbackQuery.data;

        let playerState = loadPlayerState(chatId);

        if (!playerState && !["start_journey", "rumors", "go_back_to_main_menu"].includes(data)) {
            if (data.startsWith("roll_") || data.startsWith("choose_potion_")) {
                 bot.answerCallbackQuery(callbackQuery.id, { text: INTRO_TEXTS.common.startNewGame });
                 return;
            }
            bot.answerCallbackQuery(callbackQuery.id, { text: INTRO_TEXTS.common.startNewGame });
            return;
        }

        bot.answerCallbackQuery(callbackQuery.id);

        switch (data) {
            case "start_journey":
                // Início da criação do personagem:
                playerState = {
                    currentSection: 'generate_attributes_habilidade',
                    attributes: {},
                    inventory: ["Espada", "Armadura de Couro", "Lanterna"],
                    provisions: 10,
                    potion: null,
                };
                savePlayerState(chatId, playerState);

                bot.sendMessage(chatId, INTRO_TEXTS.attributeGeneration.habilidade.prompt, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: INTRO_TEXTS.attributeGeneration.habilidade.buttonText, callback_data: "roll_d6_habilidade" }]
                        ]
                    },
                    parse_mode: "Markdown"
                });
                break;

            case "rumors":
                const optionsBelowRumors = {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "Voltar", callback_data: "go_back_to_main_menu" }],
                            [{ text: "Começar Jornada", callback_data: "start_journey" }]
                        ]
                    },
                    parse_mode: "Markdown"
                };

                bot.editMessageText(INTRO_TEXTS.rumorsText, {
                    chat_id: chatId,
                    message_id: message.message_id,
                    ...optionsBelowRumors
                }).catch(error => {
                    console.error("Erro ao editar mensagem de boatos (provavelmente muito antiga):", error);
                    bot.sendMessage(chatId, INTRO_TEXTS.rumorsText, optionsBelowRumors);
                });
                break;

            case "go_back_to_main_menu":
                bot.editMessageText(INTRO_TEXTS.welcomeMessage, {
                    chat_id: chatId,
                    message_id: message.message_id,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "Começar a Jornada", callback_data: "start_journey" }],
                            [{ text: "Boatos", callback_data: "rumors" }]
                        ]
                    },
                    parse_mode: "Markdown"
                }).catch(error => {
                     console.error("Erro ao tentar editar mensagem para voltar ao menu principal:", error);
                     displayMainMenu(chatId, bot);
                });
                break;

            case "roll_d6_habilidade":
                if (playerState && playerState.currentSection === 'generate_attributes_habilidade') {
                    const roll = rollDice(1, 6);
                    playerState.attributes.habilidadeInicial = roll + 6;
                    playerState.attributes.habilidadeAtual = playerState.attributes.habilidadeInicial;
                    playerState.currentSection = 'generate_attributes_energia';
                    savePlayerState(chatId, playerState);

                    bot.sendMessage(chatId, `Você rolou ${roll}. Sua *HABILIDADE* inicial é: *${playerState.attributes.habilidadeInicial}*.
                    ${INTRO_TEXTS.attributeGeneration.energia.prompt}`, {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: INTRO_TEXTS.attributeGeneration.energia.buttonText, callback_data: "roll_2d6_energia" }]
                            ]
                        },
                        parse_mode: "Markdown"
                    });
                } else {
                    bot.sendMessage(chatId, INTRO_TEXTS.attributeGeneration.habilidade.invalidRoll);
                }
                break;

            case "roll_2d6_energia":
                if (playerState && playerState.currentSection === 'generate_attributes_energia') {
                    const roll1 = rollDice(1, 6);
                    const roll2 = rollDice(1, 6);
                    playerState.attributes.energiaInicial = roll1 + roll2 + 12;
                    playerState.attributes.energiaAtual = playerState.attributes.energiaInicial;
                    playerState.currentSection = 'generate_attributes_sorte';
                    savePlayerState(chatId, playerState);

                    bot.sendMessage(chatId, `Você rolou ${roll1} e ${roll2}. Sua *ENERGIA* inicial é: *${playerState.attributes.energiaInicial}*.
                    ${INTRO_TEXTS.attributeGeneration.sorte.prompt}`, {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: INTRO_TEXTS.attributeGeneration.sorte.buttonText, callback_data: "roll_d6_sorte" }]
                            ]
                        },
                        parse_mode: "Markdown"
                    });
                } else {
                    bot.sendMessage(chatId, INTRO_TEXTS.attributeGeneration.energia.invalidRoll);
                }
                break;

            case "roll_d6_sorte":
                if (playerState && playerState.currentSection === 'generate_attributes_sorte') {
                    const roll = rollDice(1, 6);
                    playerState.attributes.sorteInicial = roll + 6;
                    playerState.attributes.sorteAtual = playerState.attributes.sorteInicial;
                    playerState.currentSection = 'choose_potion';
                    savePlayerState(chatId, playerState);

                    // bot.sendMessage(chatId, buildPlayerSheetMessage(playerState), { parse_mode: "Markdown" });

                    bot.sendMessage(chatId, INTRO_TEXTS.attributeGeneration.potionChoice, {
                        reply_markup: {
                            inline_keyboard: 
                                INTRO_TEXTS.attributeGeneration.potionOptions.map(option => ([{
                                    text: option.text,
                                    callback_data: option.callback_data
                                }]))
                        },
                        parse_mode: "Markdown"
                    });
                } else {
                    bot.sendMessage(chatId, INTRO_TEXTS.attributeGeneration.sorte.invalidRoll);
                }
                break;
            // Escolha da Poção
            case "choose_potion_habilidade":
            case "choose_potion_forca":
            case "choose_potion_fortuna":
                if (playerState && playerState.currentSection === 'choose_potion') {
                    let potionName;
                    if (data.includes('habilidade')) potionName = 'Poção da Habilidade';
                    else if (data.includes('forca')) potionName = 'Poção da Força';
                    else potionName = 'Poção da Fortuna';

                    playerState.potion = { name: potionName, doses: 2 };
                    playerState.currentSection = '1';
                    savePlayerState(chatId, playerState);

                    bot.sendMessage(chatId, `Você escolheu a *${potionName}*! Sua aventura está prestes a começar.`, { parse_mode: "Markdown" });
                    bot.sendMessage(chatId, buildPlayerSheetMessage(playerState), { parse_mode: "Markdown" });
                    displayGameSection(chatId, '1', bot, playerState);
                } else {
                    bot.sendMessage(chatId, INTRO_TEXTS.attributeGeneration.invalidPotion + "\n" + INTRO_TEXTS.common.startNewGame);
                }
                break;

            default:
                if (data.startsWith("option_")) {
                    const nextSectionId = data.split('_')[1];
                    if (playerState) {
                        playerState.currentSection = nextSectionId;
                        savePlayerState(chatId, playerState);
                        displayGameSection(chatId, nextSectionId, bot, playerState);
                    } else {
                        bot.sendMessage(chatId, INTRO_TEXTS.common.startNewGame);
                    }
                } else {
                    console.log(`Callback de dado não tratado: ${data}. Player state: ${playerState ? playerState.currentSection : 'none'}`);
                    bot.sendMessage(chatId, INTRO_TEXTS.common.invalidChoice);
                }
                break;
        }
    });
}

module.exports = {
    registerCallbackHandlers
};


// Função auxiliar para exibir a ficha do jogador
function buildPlayerSheetMessage(playerState) {
    return `
        *--- FICHA DE AVENTURA ---*
        *HABILIDADE Inicial:* ${playerState.attributes.habilidadeInicial}
        *HABILIDADE Atual:* ${playerState.attributes.habilidadeAtual}

        *ENERGIA Inicial:* ${playerState.attributes.energiaInicial}
        *ENERGIA Atual:* ${playerState.attributes.energiaAtual}

        *SORTE Inicial:* ${playerState.attributes.sorteInicial}
        *SORTE Atual:* ${playerState.attributes.sorteAtual}

        *ITENS:* ${playerState.inventory.join(', ')}
        *PROVISÕES RESTANTES:* ${playerState.provisions}
        *POÇÃO:* ${playerState.potion ? `${playerState.potion.name} (${playerState.potion.doses} doses)` : 'Nenhuma'}
        *--------------------------------*
    `;
}

function displayGameSection(chatId, sectionId, bot, playerState) {
    const section = GAME_HISTORY[sectionId];
    if (!section) {
        bot.sendMessage(chatId, "Erro: Seção do jogo não encontrada. Por favor, inicie um novo jogo com /start.");
        return;
    }

    let messageText = section.texto.join('\n');

    let inlineKeyboard = [];
    if (section.opcoes) {
        section.opcoes.forEach((opcao, index) => {
            inlineKeyboard.push([{ text: opcao.texto, callback_data: `option_${opcao.vai_para}` }]);
        });
    }

    const options = {
        reply_markup: {
            inline_keyboard: inlineKeyboard
        },
        parse_mode: "Markdown"
    };

    // Envia a imagem se existir
    if (section.imagem && section.imagem !== "nenhuma") {
        const imagePath = path.join(__dirname, '..', 'assets', section.imagem); // Assumindo pasta 'assets' para imagens
        if (fs.existsSync(imagePath)) {
            // Enviar a imagem e o texto como caption
            bot.sendPhoto(chatId, imagePath, { caption: messageText, ...options });
        } else {
            // Se a imagem não for encontrada, envia apenas o texto
            bot.sendMessage(chatId, messageText + "\n\n(Imagem não encontrada em " + section.imagem + ")", options);
        }
    } else {
        // Se não há imagem, envia apenas o texto
        bot.sendMessage(chatId, messageText, options);
    }

    /* Lógicas a serem implementadas aqui, conforme o history.json */
    // if (section.combate) { /* Lógica de combate */ }
    // if (section.teste_sorte) { /* Lógica de teste de sorte */ }
    // if (section.modificador_atributo) { /* Aplicar modificadores */ }
    // if (section.item_encontrado) { /* Adicionar itens */ }
    // if (section.evento) { /* Lógicas de eventos especiais */ }
    // if (section.fim_de_jogo) { /* Lógica de fim de jogo */ }
}