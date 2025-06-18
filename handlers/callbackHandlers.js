const { loadPlayerState, savePlayerState, deletePlayerState } = require('../lib/playerState');
const { rollDice } = require('../lib/diceRoller');
const { INTRO_TEXTS, GAME_HISTORY } = require('../lib/gameLoader');
const { displayMainMenu } = require('./commandHandlers');
const { buildPlayerSheetMessage } = require('../lib/messageBuilder'); // Importa a função de construção da ficha
const fs = require('fs');
const path = require('path');


// Funções Auxiliares de Lógica do Jogo

/**
 * Aplica modificadores aos atributos do jogador, respeitando limites.
 * @param {object} playerState - O estado atual do jogador.
 * @param {object} modifier - O objeto modificador (ex: { atributo: "ENERGIA", valor: -1, tipo: "atual" }).
 */
function applyAttributeModifier(playerState, modifier, bot, chatId) {
    const { atributo, valor, tipo, item } = modifier;

    // Lógica para Ouro e Provisões
    if (atributo === "OURO") {
        playerState.gold = (playerState.gold || 0) + valor;
        bot.sendMessage(chatId, `Seu ouro foi ajustado em ${valor}. Ouro atual: ${playerState.gold}.`, { parse_mode: "Markdown" });
        return;
    }
    if (atributo === "PROVISOES") {
        playerState.provisions += valor;
        bot.sendMessage(chatId, `Suas provisões foram ajustadas em ${valor}. Provisões atuais: ${playerState.provisions}.`, { parse_mode: "Markdown" });
        return;
    }

    // Lógica para HABILIDADE, ENERGIA, SORTE
    if (playerState.attributes[atributo]) {
        let currentValue = playerState.attributes[atributo];
        let initialValue = playerState.attributes[atributo + 'Inicial'];

        switch (tipo) {
            case "restaurar_total": // Restaura para o valor inicial
                playerState.attributes[atributo] = initialValue;
                bot.sendMessage(chatId, `Sua *${atributo.toUpperCase()}* foi restaurada para o valor inicial: ${playerState.attributes[atributo]}.`, { parse_mode: "Markdown" });
                break;
            case "restaurar_ate": // Restaura até um certo ponto (ex: 2 pontos abaixo do inicial)
                playerState.attributes[atributo] = Math.min(initialValue, currentValue + valor);
                bot.sendMessage(chatId, `Sua *${atributo.toUpperCase()}* foi restaurada. Valor atual: ${playerState.attributes[atributo]}.`, { parse_mode: "Markdown" });
                break;
            case "ambos": // Modifica tanto o inicial quanto o atual (ex: Espada Encantada)
                playerState.attributes[atributo + 'Inicial'] += valor;
                playerState.attributes[atributo] += valor;
                bot.sendMessage(chatId, `Sua *${atributo.toUpperCase()}* (inicial e atual) foi modificada em ${valor}. Novo valor: ${playerState.attributes[atributo]}.`, { parse_mode: "Markdown" });
                break;
            default: // Modificador padrão (soma/subtrai do atual)
                playerState.attributes[atributo] += valor;
                bot.sendMessage(chatId, `Sua *${atributo.toUpperCase()}* foi modificada em ${valor}. Novo valor: ${playerState.attributes[atributo]}.`, { parse_mode: "Markdown" });
                break;
        }

        // Garante que o atributo atual não exceda o inicial, a menos que o tipo seja "ambos"
        if (tipo !== "ambos" && playerState.attributes[atributo] > initialValue) {
             playerState.attributes[atributo] = initialValue;
             // bot.sendMessage(chatId, `Sua *${atributo.toUpperCase()}* não pode exceder o valor inicial. Valor atual: ${playerState.attributes[atributo]}.`);
        }
        // Garante que atributos não fiquem abaixo de zero (ou um para HABILIDADE)
        if (playerState.attributes[atributo] < 0) {
            playerState.attributes[atributo] = 0;
        }
        if (atributo === "habilidadeAtual" && playerState.attributes[atributo] < 1) {
            playerState.attributes[atributo] = 1; // Habilidade mínima é 1
        }
    }
}

/**
 * Lida com a aquisição de itens pelo jogador.
 * @param {object} playerState - O estado atual do jogador.
 * @param {object} itemData - Dados do item a ser encontrado.
 */
function handleItemFound(chatId, bot, playerState, itemData) {
    if (itemData.item === "Ouro") {
        playerState.gold = (playerState.gold || 0) + itemData.quantidade;
        bot.sendMessage(chatId, `Você encontrou *${itemData.quantidade} Peças de Ouro*! Seu total de ouro é: ${playerState.gold}.`, { parse_mode: "Markdown" });
    } else if (itemData.item.includes("Jóia") || itemData.item.includes("Brincos")) { //
        playerState.jewels.push({ name: itemData.item, value: itemData.valor_ouro || 0 }); //
        bot.sendMessage(chatId, `Você encontrou: *${itemData.item}*!`, { parse_mode: "Markdown" });
    } else if (itemData.item === "Poção de Invisibilidade") {
        // Poção de Invisibilidade é adicionada ao inventário e tem 1 dose.
        playerState.inventory.push(itemData.item);
        bot.sendMessage(chatId, `Você encontrou uma *${itemData.item}*! (1 dose)`, { parse_mode: "Markdown" });
    } else {
        // Para itens com 'troca_obrigatoria', a lógica de escolha é complexa para um callback direto.
        // Por simplicidade, vamos adicionar ao inventário e notificar o jogador.
        // O jogo original exige uma escolha, o bot simplificará, adicionando-o.
        // Futuras melhorias podem incluir uma etapa de escolha.
        if (itemData.troca_obrigatoria && playerState.inventory.length >= 1) { // Supondo que você pode querer limitar o inventário.
            bot.sendMessage(chatId, `Você encontrou *${itemData.item}*! Para pegá-lo, você *precisa* descartar um item do seu inventário. (Funcionalidade de troca não implementada. Item adicionado automaticamente para prosseguir.)`, { parse_mode: "Markdown" });
        } else {
            bot.sendMessage(chatId, `Você encontrou *${itemData.item}*!`, { parse_mode: "Markdown" });
        }
        playerState.inventory.push(itemData.item); //
    }
}

/**
 * Lida com eventos especiais como descanso, consumo de itens, etc.
 * @param {object} playerState - O estado atual do jogador.
 * @param {object} eventData - Dados do evento.
 * @param {object} bot - Instância do bot.
 * @param {string} chatId - ID do chat.
 */
function handleGameEvent(playerState, eventData, bot, chatId) {
    switch (eventData.tipo) {
        case "descanso": //
            if (playerState.provisions > 0) {
                applyAttributeModifier(playerState, { atributo: "ENERGIA", valor: 4, tipo: "restaurar_ate" }, bot, chatId); // Recupera 4 ENERGIA, até o máximo inicial
                playerState.provisions--;
                bot.sendMessage(chatId, `Você comeu uma provisão e recuperou 4 de ENERGIA. Provisões restantes: ${playerState.provisions}.`, { parse_mode: "Markdown" });
            } else {
                bot.sendMessage(chatId, "Você não tem provisões para comer.", { parse_mode: "Markdown" });
            }
            break;
        case "descanso_encantado": //
            applyAttributeModifier(playerState, { atributo: "ENERGIA", valor: 2, tipo: "restaurar_ate" }, bot, chatId);
            applyAttributeModifier(playerState, { atributo: "HABILIDADE", valor: 1, tipo: "restaurar_ate" }, bot, chatId);
            bot.sendMessage(chatId, "Você desfrutou de um descanso encantado e recuperou ENERGIA e HABILIDADE!", { parse_mode: "Markdown" });
            // Supõe que o jogador já comeu a provisão ou que não precisa comer aqui, conforme o texto
            break;
        case "descanso_compartilhado": //
            if (playerState.provisions > 0) {
                applyAttributeModifier(playerState, { atributo: "ENERGIA", valor: 2, tipo: "restaurar_ate" }, bot, chatId); // Metade do normal
                playerState.provisions--;
                bot.sendMessage(chatId, `Você compartilhou uma provisão e recuperou 2 de ENERGIA. Provisões restantes: ${playerState.provisions}.`, { parse_mode: "Markdown" });
            } else {
                bot.sendMessage(chatId, "Você não tem provisões para compartilhar.", { parse_mode: "Markdown" });
            }
            break;
        case "item_perdido": //
            const itemIndex = playerState.inventory.indexOf(eventData.item);
            if (itemIndex > -1) {
                playerState.inventory.splice(itemIndex, 1);
                bot.sendMessage(chatId, `Você perdeu seu(sua) ${eventData.item}.`, { parse_mode: "Markdown" });
            }
            break;
        case "descarte_item_ou_ouro": //
            // Esta lógica é complexa para um callback direto e requereria menus.
            // Por simplicidade, o livro-jogo presume que o jogador fez a escolha.
            // Para o bot, vamos apenas assumir que um item foi "descartado" (não removemos, mas notificamos).
            bot.sendMessage(chatId, "Você descartou um item ou uma Peça de Ouro para distrair o Ogro. (Item não removido do inventário automaticamente neste protótipo, mas considere-o usado.)", { parse_mode: "Markdown" });
            break;
        case "conhecimento_ganho": //
            playerState.knowledge = playerState.knowledge || {};
            playerState.knowledge[eventData.conhecimento] = true;
            bot.sendMessage(chatId, `Você adquiriu o conhecimento sobre: *${eventData.conhecimento}*!`, { parse_mode: "Markdown" });
            break;
        case "item_amaldicoado": //
            playerState.cursedItems = playerState.cursedItems || [];
            playerState.cursedItems.push(eventData.item);
            bot.sendMessage(chatId, `Você adquiriu um item amaldiçoado: *${eventData.item}*!`, { parse_mode: "Markdown" });
            break;
        case "puzzle_soma_chaves": //
            handleKeyPuzzle(chatId, bot, playerState, eventData);
            return; // A lógica de navegação é tratada pelo puzzle de chaves.
        case "monstro_itinerante": //
            handleWanderingMonster(chatId, bot, playerState, eventData);
            return; // A lógica de navegação é tratada pelo monstro itinerante.
        case "jogo_dados_aposta": //
            handleDiceGameBet(chatId, bot, playerState, eventData);
            return; // A lógica de navegação é tratada pelo jogo de dados.
        case "jogo_cartas_sorte": //
            handleCardGameLuck(chatId, bot, playerState, eventData);
            return; // A lógica de navegação é tratada pelo jogo de cartas.
        case "combate_condicional_piranhas": //
            handlePiranhaCombat(chatId, bot, playerState, eventData);
            return; // A lógica de navegação é tratada pelo combate.
        // Adicionar outros tipos de evento aqui, conforme necessário
        default:
            console.warn(`Evento não tratado: ${eventData.tipo}`);
            break;
    }
}

/**
 * Inicia um combate contra um ou mais monstros.
 * @param {object} chatId - ID do chat do Telegram.
 * @param {object} bot - Instância do bot.
 * @param {object} playerState - Estado do jogador.
 * @param {object} combatData - Dados do combate do history.json.
 */
async function startCombat(chatId, bot, playerState, combatData) {
    playerState.combat = {
        monsters: combatData.monstros.map(m => ({ ...m })), // Copia para não modificar o original
        currentMonsterIndex: 0, // Índice do monstro atual
        round: 0, // Rodada atual de combate
        fleeOption: combatData.opcoes_fuga, // Opção de fuga
        victoryGoTo: combatData.vitoria, // Destino após a vitória
        specialInstructions: combatData.instrucoes_especiais, // Instruções especiais
        eventCombat: combatData.eventos_combate, // Eventos durante o combate (ex: 1º ferimento)
        tempMonsterModifiers: {}, // Modificadores temporários para monstros em combate (ex: Vampiro ferido)
        tempPlayerModifiers: {} // Modificadores temporários para jogador em combate (ex: botas amaldiçoadas)
    };

    // Aplica modificadores temporários ao jogador se existirem (ex: Elmo Mágico, Botas Amaldiçoadas)
    if (playerState.inventory.includes("Elmo Mágico")) {
        playerState.temporaryModifiers.attackRollBonus = (playerState.temporaryModifiers.attackRollBonus || 0) + 1;
        bot.sendMessage(chatId, `Seu Elmo Mágico lhe concede +1 na Força de Ataque.`, { parse_mode: "Markdown" });
    }
    if (playerState.cursedItems && playerState.cursedItems.includes("Botas Amaldiçoadas")) { // Exemplo para as botas amaldiçoadas da seção 394
        playerState.temporaryModifiers.attackRollPenalty = (playerState.temporaryModifiers.attackRollPenalty || 0) - 2; // Subtrai 2 pontos
        bot.sendMessage(chatId, `Suas Botas Amaldiçoadas impõem uma penalidade de -2 na sua Força de Ataque.`, { parse_mode: "Markdown" });
    }

    savePlayerState(chatId, playerState);

    bot.sendMessage(chatId, `*INÍCIO DO COMBATE!*`, { parse_mode: "Markdown" });
    if (playerState.combat.specialInstructions) {
        bot.sendMessage(chatId, `Instruções Especiais: ${playerState.combat.specialInstructions}`, { parse_mode: "Markdown" });
    }
    await sendCombatRoundMessage(chatId, bot, playerState);
}

/**
 * Envia a mensagem e opções para a próxima rodada de combate.
 */
async function sendCombatRoundMessage(chatId, bot, playerState) {
    const combat = playerState.combat;
    if (!combat || combat.monsters.length === 0) return; // Não há combate ativo

    const currentMonster = combat.monsters[combat.currentMonsterIndex];

    if (currentMonster.energia <= 0) {
        bot.sendMessage(chatId, `*${currentMonster.nome}* foi derrotado!`, { parse_mode: "Markdown" });

        // Verifica eventos de combate após derrotar um monstro específico
        if (combat.eventCombat) {
            for (const event of combat.eventCombat) {
                if (event.condicao === "monstro_derrotado" && event.alvo === combat.currentMonsterIndex) {
                    if (event.efeito) {
                        applyAttributeModifier(playerState, event.efeito, bot, chatId);
                    }
                    if (event.vai_para) {
                         // Se há uma navegação explícita aqui, vamos para ela.
                         // Se for uma sequência de monstros, ele continua para o próximo.
                         playerState.currentSection = event.vai_para;
                         savePlayerState(chatId, playerState);
                         await displayGameSection(chatId, event.vai_para, bot, playerState);
                         return;
                    }
                }
            }
        }

        combat.currentMonsterIndex++; // Avança para o próximo monstro
        if (combat.currentMonsterIndex >= combat.monsters.length) {
            // Todos os monstros derrotados, fim do combate
            playerState.combat = null; // Reseta o combate
            savePlayerState(chatId, playerState);
            bot.sendMessage(chatId, `*VOCÊ VENCEU O COMBATE!*`, { parse_mode: "Markdown" });
            await displayGameSection(chatId, combat.victoryGoTo.vai_para, bot, playerState); // Vai para a seção de vitória
            return;
        } else {
            const nextMonster = combat.monsters[combat.currentMonsterIndex];
            bot.sendMessage(chatId, `Próximo adversário: *${nextMonster.nome}* (HAB: ${nextMonster.habilidade} EN: ${nextMonster.energia}).`, { parse_mode: "Markdown" });
        }
    }

    if (playerState.attributes.energiaAtual <= 0) {
        playerState.combat = null;
        playerState.currentSection = null;
        savePlayerState(chatId, playerState);
        bot.sendMessage(chatId, `Sua *ENERGIA* chegou a zero. Sua aventura terminou aqui. Digite /start para tentar novamente.`, { parse_mode: "Markdown" });
        return;
    }

    combat.round++;
    let combatMessage = `*--- RODADA ${combat.round} ---*\n`;
    combatMessage += `Você (HAB: ${playerState.attributes.habilidadeAtual}, EN: ${playerState.attributes.energiaAtual}) vs. ${currentMonster.nome} (HAB: ${currentMonster.habilidade}, EN: ${currentMonster.energia})\n\n`;

    let options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: `Atacar ${currentMonster.nome}`, callback_data: `combat_attack_${combat.round}` }]
            ]
        },
        parse_mode: "Markdown"
    };

    // Opção de fuga, se aplicável
    if (combat.fleeOption && (!combat.fleeOption.rodada_minima || combat.round >= combat.fleeOption.rodada_minima)) {
        options.reply_markup.inline_keyboard.push([{ text: combat.fleeOption.texto, callback_data: `combat_flee_${combat.round}` }]);
    }
    // Opção de usar Sorte
    if (playerState.attributes.sorteAtual > 0) {
        options.reply_markup.inline_keyboard.push([{ text: `Tentar a Sorte no Combate (-1 Sorte)`, callback_data: `combat_use_luck_${combat.round}` }]);
    }

    bot.sendMessage(chatId, combatMessage, options);
}

/**
 * Executa uma série de ataque no combate.
 */
async function executeCombatRound(chatId, bot, playerState) {
    const combat = playerState.combat;
    if (!combat || combat.monsters.length === 0) return;

    const currentMonster = combat.monsters[combat.currentMonsterIndex];

    let playerAttackRoll = rollDice(2, 6);
    let playerAttackStrength = playerState.attributes.habilidadeAtual + playerAttackRoll;
    // Aplica modificadores temporários do jogador (ex: Elmo Mágico, Botas Amaldiçoadas)
    playerAttackStrength += (playerState.temporaryModifiers.attackRollBonus || 0);
    playerAttackStrength += (playerState.temporaryModifiers.attackRollPenalty || 0); // Penalidade (valor negativo)

    let monsterAttackRoll = rollDice(2, 6);
    let monsterAttackStrength = currentMonster.habilidade + monsterAttackRoll;

    let roundOutcomeMessage = `Seu rolamento de ataque: ${playerAttackRoll} (Força: ${playerAttackStrength})\n`;
    roundOutcomeMessage += `Ataque de ${currentMonster.nome}: ${monsterAttackRoll} (Força: ${monsterAttackStrength})\n\n`;

    let playerHit = false;
    let monsterHit = false;

    if (playerAttackStrength > monsterAttackStrength) {
        currentMonster.energia -= 2; // Você feriu o monstro
        playerHit = true;
        roundOutcomeMessage += `Você feriu *${currentMonster.nome}*! (${currentMonster.nome} ENERGIA: ${currentMonster.energia})\n`;
    } else if (monsterAttackStrength > playerAttackStrength) {
        playerState.attributes.energiaAtual -= 2; // Monstro feriu você
        monsterHit = true;
        roundOutcomeMessage += `*${currentMonster.nome}* feriu você! (Sua ENERGIA: ${playerState.attributes.energiaAtual})\n`;
    } else {
        roundOutcomeMessage += `Vocês se esquivaram mutuamente. Ninguém foi ferido.\n`;
    }

    // Verifica eventos de combate por ferimento causado
    if (playerHit && combat.eventCombat) {
        for (const event of combat.eventCombat) {
            if (event.condicao === "primeiro_ferimento_causado" && event.alvo === combat.currentMonsterIndex) {
                bot.sendMessage(chatId, event.texto || "Um evento especial foi ativado!", { parse_mode: "Markdown" });
                if (event.vai_para) {
                    playerState.currentSection = event.vai_para;
                    playerState.combat = null; // Encerra o combate para ir para a seção.
                    savePlayerState(chatId, playerState);
                    await bot.sendMessage(chatId, roundOutcomeMessage, { parse_mode: "Markdown" });
                    await displayGameSection(chatId, event.vai_para, bot, playerState);
                    return;
                }
            }
        }
    }

    savePlayerState(chatId, playerState);
    await bot.sendMessage(chatId, roundOutcomeMessage, { parse_mode: "Markdown" });
    await sendCombatRoundMessage(chatId, bot, playerState); // Próxima rodada
}

/**
 * Lida com o teste de sorte durante o combate.
 */
async function useLuckInCombat(chatId, bot, playerState) {
    const combat = playerState.combat;
    if (!combat || playerState.attributes.sorteAtual <= 0) {
        bot.sendMessage(chatId, "Você não pode usar a sorte neste momento ou não tem sorte suficiente.", { parse_mode: "Markdown" });
        return;
    }

    playerState.attributes.sorteAtual--; // Sempre perde 1 de sorte ao testar
    const luckRoll = rollDice(2, 6);
    let luckMessage = `Você testou sua Sorte (Sorte atual: ${playerState.attributes.sorteAtual}). Rolou ${luckRoll}.\n`;

    const currentMonster = combat.monsters[combat.currentMonsterIndex];

    if (luckRoll <= playerState.attributes.sorteAtual) { // Teve sorte
        luckMessage += `Você teve sorte! `;
        luckMessage += "Você sente que sua sorte influenciará o próximo movimento.";
    } else { // Não teve sorte
        luckMessage += `Você não teve sorte. `;
        luckMessage += "Sua sorte não o ajudou desta vez.";
    }

    savePlayerState(chatId, playerState);
    await bot.sendMessage(chatId, luckMessage, { parse_mode: "Markdown" });
    await sendCombatRoundMessage(chatId, bot, playerState); // Volta para a rodada de combate
}


/**
 * Lida com testes de sorte específicos de uma seção.
 */
async function handleLuckTest(chatId, bot, playerState, luckTestData) {
    let playerLuck = playerState.attributes.sorteAtual;
    if (playerLuck <= 0) {
        bot.sendMessage(chatId, "Você não tem sorte suficiente para fazer este teste.", { parse_mode: "Markdown" });
        if (luckTestData.falha && luckTestData.falha.vai_para) {
            playerState.currentSection = luckTestData.falha.vai_para;
            savePlayerState(chatId, playerState);
            await displayGameSection(chatId, luckTestData.falha.vai_para, bot, playerState);
        }
        return;
    }

    playerState.attributes.sorteAtual--; // Perde 1 de sorte ao testar
    const roll = rollDice(2, 6);
    let message = `Você testa sua sorte (Sorte atual: ${playerState.attributes.sorteAtual}). Rolou ${roll}.\n`;

    if (roll <= playerLuck) {
        message += `*Você teve sorte!* ${luckTestData.sucesso.texto || ''}`;
        if (luckTestData.sucesso.efeito) {
            applyAttributeModifier(playerState, luckTestData.sucesso.efeito, bot, chatId);
        }
        playerState.currentSection = luckTestData.sucesso.vai_para;
    } else {
        message += `*Você não teve sorte.* ${luckTestData.falha.texto || ''}`;
        if (luckTestData.falha.efeito) {
            applyAttributeModifier(playerState, luckTestData.falha.efeito, bot, chatId);
        }
        playerState.currentSection = luckTestData.falha.vai_para;
    }
    savePlayerState(chatId, playerState);
    await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
    await displayGameSection(chatId, playerState.currentSection, bot, playerState);
}

/**
 * Lida com testes de dados específicos de uma seção (não Teste de Sorte).
 */
async function handleDiceTest(chatId, bot, playerState, diceTestData) {
    const roll = rollDice(diceTestData.dados, 6);
    let message = `Você rolou ${diceTestData.dados}d6 e obteve *${roll}*. \n`;

    let nextSectionId = null;
    let appliedEffect = null;

    for (const condition of diceTestData.condicoes) {
        let conditionMet = false;
        if (condition.valor !== undefined && roll === condition.valor) {
            conditionMet = true;
        } else if (condition.valor_entre) {
            if (roll >= condition.valor_entre[0] && roll <= condition.valor_entre[1]) {
                conditionMet = true;
            }
        }

        if (conditionMet) {
            message += `${condition.texto || ''}\n`;
            if (condition.efeito) {
                appliedEffect = condition.efeito;
            }
            nextSectionId = condition.vai_para;
            break;
        }
    }

    if (appliedEffect) {
        applyAttributeModifier(playerState, appliedEffect, bot, chatId);
    }

    playerState.currentSection = nextSectionId;
    savePlayerState(chatId, playerState);
    await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
    await displayGameSection(chatId, nextSectionId, bot, playerState);
}

/**
 * Lida com testes de atributo específicos (ex: Habilidade).
 */
async function handleAttributeTest(chatId, bot, playerState, attributeTestData) {
    const roll = rollDice(attributeTestData.dados, 6);
    const attributeValue = playerState.attributes[attributeTestData.atributo + 'Atual'];
    let message = '';

    let nextSectionId = null;
    let appliedEffect = null;

    if (roll <= attributeValue) { // Sucesso
        message += `${attributeTestData.sucesso.texto || ''}\n`;
        if (attributeTestData.sucesso.efeito) {
            appliedEffect = attributeTestData.sucesso.efeito;
        }
        nextSectionId = attributeTestData.sucesso.vai_para;
    } else { // Falha
        message += `${attributeTestData.falha.texto || ''}\n`;
        if (attributeTestData.falha.efeito) {
            appliedEffect = attributeTestData.falha.efeito;
        }
        nextSectionId = attributeTestData.falha.vai_para;
    }

    if (appliedEffect) {
        applyAttributeModifier(playerState, appliedEffect, bot, chatId);
    }

    playerState.currentSection = nextSectionId;
    savePlayerState(chatId, playerState);
    await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
    await displayGameSection(chatId, nextSectionId, bot, playerState);
}

/**
 * Lida com testes de sorte repetidos (ex: pular azulejos).
 */
async function handleRepeatedLuckTest(chatId, bot, playerState, repeatedLuckTestData) {
    let playerLuck = playerState.attributes.sorteAtual;

    if (playerLuck <= 0) {
        bot.sendMessage(chatId, "Você não tem sorte suficiente para continuar este teste.", { parse_mode: "Markdown" });
        if (repeatedLuckTestData.falha && repeatedLuckTestData.falha.vai_para) {
            playerState.currentSection = repeatedLuckTestData.falha.vai_para;
            savePlayerState(chatId, playerState);
            await displayGameSection(chatId, playerState.currentSection, bot, playerState);
        }
        return;
    }

    playerState.attributes.sorteAtual--; // Perde 1 de sorte por tentativa
    const roll = rollDice(2, 6);
    let message = `Você testou sua Sorte (Sorte atual: ${playerState.attributes.sorteAtual}). Rolou ${roll}.\n`;

    if (roll <= playerLuck) { // Sucesso na tentativa
        message += `*Você teve sorte nesta tentativa!*`;
        playerState.combat.luckTestCount = (playerState.combat.luckTestCount || 0) + 1; // Reutilizando combat para armazenar a contagem.
        if (playerState.combat.luckTestCount >= repeatedLuckTestData.tentativas) {
            message += `\n${repeatedLuckTestData.sucesso.texto || 'Você superou o desafio!'}`;
            if (repeatedLuckTestData.sucesso.efeito) {
                applyAttributeModifier(playerState, repeatedLuckTestData.sucesso.efeito, bot, chatId);
            }
            playerState.currentSection = repeatedLuckTestData.sucesso.vai_para;
            playerState.combat.luckTestCount = 0; // Reseta a contagem
            savePlayerState(chatId, playerState);
            await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
            await displayGameSection(chatId, playerState.currentSection, bot, playerState);
        } else {
            message += ` Faltam ${repeatedLuckTestData.tentativas - playerState.combat.luckTestCount} sucessos.`;
            savePlayerState(chatId, playerState);
            await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
            await bot.sendMessage(chatId, repeatedLuckTestData.instrucoes, { // Pede para tentar novamente
                reply_markup: {
                    inline_keyboard: [
                        [{ text: `Tentar Sorte Novamente (-1 Sorte)`, callback_data: `test_repeated_luck` }]
                    ]
                },
                parse_mode: "Markdown"
            });
        }
    } else { // Falha na tentativa
        message += `*Você não teve sorte nesta tentativa.*`;
        if (repeatedLuckTestData.falha.efeito) {
            applyAttributeModifier(playerState, repeatedLuckTestData.falha.efeito, bot, chatId);
        }
        playerState.currentSection = repeatedLuckTestData.falha.vai_para;
        playerState.combat.luckTestCount = 0; // Reseta a contagem
        savePlayerState(chatId, playerState);
        await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
        await displayGameSection(chatId, playerState.currentSection, bot, playerState);
    }
}

/**
 * Lida com o puzzle de soma de chaves.
 */
async function handleKeyPuzzle(chatId, bot, playerState, puzzleData) {
    const availableKeys = playerState.inventory.filter(item => item.startsWith("Chave "));

    if (availableKeys.length < puzzleData.chaves_necessarias) {
        bot.sendMessage(chatId, `Você precisa de ${puzzleData.chaves_necessarias} chaves para tentar abrir a arca, mas tem apenas ${availableKeys.length}. Você deve explorar mais!`, { parse_mode: "Markdown" });
        playerState.currentSection = puzzleData.fallback || playerState.currentSection; // Se não houver chaves, volta para a seção atual ou fallback.
        savePlayerState(chatId, playerState);
        return;
    }

    let keyNumbers = [];
    availableKeys.forEach(key => {
        const match = key.match(/(\d+)/);
        if (match) {
            keyNumbers.push(parseInt(match[1]));
        }
    });

    if (keyNumbers.length < puzzleData.chaves_necessarias) {
        bot.sendMessage(chatId, `Você precisa de ${puzzleData.chaves_necessarias} chaves numeradas, mas tem apenas ${keyNumbers.length}.`, { parse_mode: "Markdown" });
        playerState.currentSection = puzzleData.fallback || playerState.currentSection;
        savePlayerState(chatId, playerState);
        return;
    }

    const selectedKeys = keyNumbers.slice(0, puzzleData.chaves_necessarias);
    const sumOfKeys = selectedKeys.reduce((a, b) => a + b, 0);

    bot.sendMessage(chatId, `Você tentou as chaves: ${selectedKeys.join(', ')} (Soma: ${sumOfKeys}).`, { parse_mode: "Markdown" });

    if (GAME_HISTORY[sumOfKeys.toString()]) {
        playerState.currentSection = sumOfKeys.toString();
    } else {
        playerState.currentSection = "198"; 
        bot.sendMessage(chatId, "As chaves não parecem funcionar... algo inesperado acontece!", { parse_mode: "Markdown" });
    }
    savePlayerState(chatId, playerState);
    await displayGameSection(chatId, playerState.currentSection, bot, playerState);
}


/**
 * Lida com monstros itinerantes.
 */
async function handleWanderingMonster(chatId, bot, playerState, eventData) {
    const roll = rollDice(1, 6);
    let monsterEncountered = null;

    for (const key in eventData.tabela) {
        if (parseInt(key) === roll) {
            monsterEncountered = eventData.tabela[key];
            break;
        }
    }

    if (monsterEncountered) {
        bot.sendMessage(chatId, `Um *${monsterEncountered.nome.toUpperCase()}* apareceu! Prepare-se para lutar.`, { parse_mode: "Markdown" });
        const combatConfig = {
            monstros: [monsterEncountered],
            victoryGoTo: { vai_para: playerState.anotatedSection || eventData.fallbackSection },
        };
        startCombat(chatId, bot, playerState, combatConfig);
    } else {
        bot.sendMessage(chatId, "Nenhum monstro apareceu, ou houve um erro na rolagem da tabela.", { parse_mode: "Markdown" });
        playerState.currentSection = playerState.anotatedSection || eventData.fallbackSection;
        savePlayerState(chatId, playerState);
        await displayGameSection(chatId, playerState.currentSection, bot, playerState);
    }
}


/**
 * Lida com o jogo de dados de aposta na seção 130.
 */
async function handleDiceGameBet(chatId, bot, playerState, eventData) {
    let options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "Apostar 5 Ouro", callback_data: `bet_gold_5` }],
                [{ text: "Apostar 10 Ouro", callback_data: `bet_gold_10` }],
                [{ text: "Apostar Tudo", callback_data: `bet_gold_all` }]
            ]
        },
        parse_mode: "Markdown"
    };

    bot.sendMessage(chatId, `O velho propõe um jogo de dados. Quanto você aposta (min ${eventData.min_aposta}, max ${eventData.max_aposta})? Seu ouro atual: ${playerState.gold}.`, options);
    playerState.currentSection = 'awaiting_bet'; // Define um estado de espera.
    savePlayerState(chatId, playerState);
}

/**
 * Lida com o jogo de cartas com ou sem sorte.
 */
async function handleCardGameLuck(chatId, bot, playerState, eventData) {
    let options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "Jogar Honestamente (2D6 Par/Ímpar)", callback_data: `card_game_honest` }],
                [{ text: "Tentar Trapacear (Teste de Sorte)", callback_data: `card_game_cheat` }]
            ]
        },
        parse_mode: "Markdown"
    };
    bot.sendMessage(chatId, "Você pode jogar cartas honestamente ou tentar trapacear. Qual a sua escolha?", options);
    playerState.currentSection = 'awaiting_card_game_choice';
    savePlayerState(chatId, playerState);
}

/**
 * Lida com o combate condicional das piranhas (seção 350).
 */
async function handlePiranhaCombat(chatId, bot, playerState, eventData) {
    let message = "A 'turbulência' são Piranhas! Elas atacam.\n";
    const crocodiloFerido = playerState.tempMonsterModifiers && playerState.tempMonsterModifiers.crocodilo_ferido;

    if (crocodiloFerido) {
        message += "Sua sorte: as piranhas atacam o crocodilo ferido!";
        applyAttributeModifier(playerState, { atributo: "HABILIDADE", valor: 1 }, bot, chatId);
        applyAttributeModifier(playerState, { atributo: "SORTE", valor: 2 }, bot, chatId);
        playerState.currentSection = "259";
    } else {
        const roll = rollDice(1, 6);
        if (roll <= 2) {
            message += "As piranhas focam em você!";
            startCombat(chatId, bot, playerState, {
                monstros: [{ nome: "PIRANHAS", habilidade: 5, energia: 5 }],
                victoryGoTo: { vai_para: "218" }
            });
            await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
            return;
        } else {
            message += "As piranhas atacam o crocodilo (ou outro alvo próximo). Você escapa!";
            playerState.currentSection = "259";
        }
    }
    playerState.combat.tempMonsterModifiers = {}; // Limpa modificador temporário
    savePlayerState(chatId, playerState);
    await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
    await displayGameSection(chatId, playerState.currentSection, bot, playerState);
}


/**
 * Função principal para exibir uma seção do jogo e processar seus eventos.
 * @param {string} chatId - ID do chat.
 * @param {string} sectionId - ID da seção a ser exibida.
 * @param {object} bot - Instância do bot.
 * @param {object} playerState - Estado atual do jogador.
 */
async function displayGameSection(chatId, sectionId, bot, playerState) {
    const section = GAME_HISTORY[sectionId];
    if (!section) {
        bot.sendMessage(chatId, "Erro: Seção do jogo não encontrada. Por favor, inicie um novo jogo com /start.");
        return;
    }

    playerState.currentSection = sectionId;

    let messageText = section.texto.join('\n\n');
    let inlineKeyboard = [];

    // Anotar referência para monstros itinerantes
    if (section.anotar_referencia) {
        playerState.anotatedSection = section.anotar_referencia;
    }

    // Lógica de Fim de Jogo
    if (section.fim_de_jogo) {
        await bot.sendMessage(chatId, messageText, { parse_mode: "Markdown" });
        if (section.imagem && section.imagem !== "nenhuma") {
            const imagePath = path.join(__dirname, '..', 'assets', section.imagem);
            if (fs.existsSync(imagePath)) await bot.sendPhoto(chatId, imagePath);
        }
        const finalMessage = section.fim_de_jogo === "vitoria" 
            ? "*PARABÉNS, AVENTUREIRO! VOCÊ VENCEU!*"
            : "*FIM DE JOGO! Sua aventura terminou aqui.*";
        await bot.sendMessage(chatId, `${finalMessage}\nDigite /start para começar uma nova aventura.`, { parse_mode: "Markdown" });
        deletePlayerState(chatId);
        return;
    }

    // Lógica de Combate
    if (section.combate) {
        await bot.sendMessage(chatId, messageText, { parse_mode: "Markdown" });
        startCombat(chatId, bot, playerState, section.combate);
        return;
    }

    // Lógicas de Testes
    if (section.teste_sorte) {
        await bot.sendMessage(chatId, messageText, { parse_mode: "Markdown" });
        if (playerState.attributes.sorteAtual > 0) {
            const options = {
                reply_markup: { inline_keyboard: [[{ text: `Testar sua Sorte (-1 Sorte)`, callback_data: `test_luck_section_${sectionId}` }]] },
                parse_mode: "Markdown"
            };
            await bot.sendMessage(chatId, "Deseja testar sua sorte?", options);
        } else {
            await bot.sendMessage(chatId, "Você não tem Sorte para este teste. Falha automática.", { parse_mode: "Markdown" });
            if (section.teste_sorte.falha && section.teste_sorte.falha.vai_para) {
                 if(section.teste_sorte.falha.efeito) applyAttributeModifier(playerState, section.teste_sorte.falha.efeito, bot, chatId);
                 await displayGameSection(chatId, section.teste_sorte.falha.vai_para, bot, playerState);
            }
        }
        return;
    }

    if (section.teste_dado) {
        await bot.sendMessage(chatId, messageText, { parse_mode: "Markdown" });
        const options = {
            reply_markup: { inline_keyboard: [[{ text: `Rolar ${section.teste_dado.dados}d6`, callback_data: `test_dice_section_${sectionId}` }]] },
            parse_mode: "Markdown"
        };
        await bot.sendMessage(chatId, "Hora de rolar os dados!", options);
        return;
    }

    if (section.teste_atributo) {
        await bot.sendMessage(chatId, messageText, { parse_mode: "Markdown" });
        const options = {
            reply_markup: { inline_keyboard: [[{ text: `Testar ${section.teste_atributo.atributo.toUpperCase()}`, callback_data: `test_attribute_section_${sectionId}` }]] },
            parse_mode: "Markdown"
        };
        await bot.sendMessage(chatId, `Hora de testar sua *${section.teste_atributo.atributo.toUpperCase()}*!`, options);
        return;
    }

    if (section.teste_sorte_repetido) {
        await bot.sendMessage(chatId, messageText, { parse_mode: "Markdown" });
        playerState.combat = playerState.combat || {};
        playerState.combat.luckTestCount = 0;
        const options = {
            reply_markup: { inline_keyboard: [[{ text: `Tentar Sorte (-1 Sorte)`, callback_data: `test_repeated_luck_section_${sectionId}` }]] },
            parse_mode: "Markdown"
        };
        await bot.sendMessage(chatId, section.teste_sorte_repetido.instrucoes, options);
        return;
    }

    // Modificadores e Itens
    if (section.modificador_atributo) {
        section.modificador_atributo.forEach(mod => {
            applyAttributeModifier(playerState, mod, bot, chatId);
        });
    }

    if (section.item_encontrado) {
        for (const itemData of section.item_encontrado) {
            handleItemFound(chatId, bot, playerState, itemData);
        }
    }

    if (section.evento) {
        await handleGameEvent(playerState, section.evento, bot, chatId);
        if (playerState.currentSection !== sectionId) {
             return;
        }
    }

    // Opções de Navegação
    if (section.opcoes) {
        section.opcoes.forEach((opcao) => {
            let canShowOption = true;
            if (opcao.requisito) {
                if (opcao.requisito.item) {
                    if (opcao.requisito.item === "Ouro") {
                        canShowOption = (playerState.gold || 0) >= opcao.requisito.quantidade;
                    } else if (opcao.requisito.item_tipo === "prata") {
                        canShowOption = playerState.inventory.some(item => item.toLowerCase().includes("prata"));
                    } else if (opcao.requisito.conhecimento) {
                        canShowOption = playerState.knowledge && playerState.knowledge[opcao.requisito.conhecimento];
                    } else {
                        canShowOption = playerState.inventory.includes(opcao.requisito.item);
                    }
                }
            }
            if (canShowOption) {
                inlineKeyboard.push([{ text: opcao.texto, callback_data: `option_${opcao.vai_para}` }]);
            }
        });
    }

    const options = {
        reply_markup: { inline_keyboard: inlineKeyboard },
        parse_mode: "Markdown"
    };

    // ### INÍCIO DO BLOCO CORRIGIDO ###
    // 1. Envia a imagem, se existir.
    if (section.imagem && section.imagem !== "nenhuma") {
        const imagePath = path.join(__dirname, '..', 'assets', section.imagem);
        if (fs.existsSync(imagePath)) {
            try {
                // Envia a foto primeiro, sem legenda, para evitar erros de tamanho.
                await bot.sendPhoto(chatId, imagePath);
            } catch (error) {
                console.error(`Erro ao enviar a imagem ${imagePath}:`, error);
                await bot.sendMessage(chatId, `(Erro ao carregar a imagem: ${section.imagem})`);
            }
        } else {
            console.warn(`Arquivo de imagem não encontrado: ${section.imagem}`);
            await bot.sendMessage(chatId, `(Imagem não encontrada: ${section.imagem})`);
        }
    }

    // 2. Em seguida, envia o texto da seção com os botões.
    // Isso garante que a legenda nunca seja muito longa e evita erros de edição.
    const sentMessage = await bot.sendMessage(chatId, messageText, options);
    playerState.lastMessageId = sentMessage.message_id; // Salva o ID para referência futura
    
    savePlayerState(chatId, playerState);
    // ### FIM DO BLOCO CORRIGIDO ###
}


// Atualiza a função registerCallbackHandlers para chamar as novas lógicas
function registerCallbackHandlers(bot) {
    bot.on('callback_query', async (callbackQuery) => {
        const message = callbackQuery.message;
        const chatId = message.chat.id;
        const data = callbackQuery.data;

        let playerState = loadPlayerState(chatId);

        if (!playerState.currentSection && !["start_journey", "rumors", "go_back_to_main_menu", "begin_adventure"].includes(data) && !data.startsWith("roll_")) {
            bot.answerCallbackQuery(callbackQuery.id, { text: INTRO_TEXTS.common.startNewGame });
            bot.sendMessage(chatId, INTRO_TEXTS.common.startNewGame, { parse_mode: "Markdown" });
            return;
        }

        await bot.answerCallbackQuery(callbackQuery.id);

        if (data.startsWith("combat_")) {
            if (!playerState.combat) {
                await bot.sendMessage(chatId, "Não há combate ativo no momento.", { parse_mode: "Markdown" });
                return;
            }
            const combatAction = data.split('_')[1];
            const roundNumber = parseInt(data.split('_')[2]);

            if (playerState.combat.lastActionRound === roundNumber) {
                return;
            }
            playerState.combat.lastActionRound = roundNumber;
            savePlayerState(chatId, playerState);

            if (combatAction === "attack") {
                await executeCombatRound(chatId, bot, playerState);
            } else if (combatAction === "flee") {
                const fleeOption = playerState.combat.fleeOption;
                let canFlee = true;

                if (fleeOption.teste_sorte) {
                    playerState.attributes.sorteAtual--;
                    const luckRoll = rollDice(2, 6);
                    if (luckRoll > playerState.attributes.sorteAtual) {
                        canFlee = false;
                        await bot.sendMessage(chatId, `Você tentou fugir, mas falhou no Teste de Sorte (Rolou ${luckRoll} vs Sorte ${playerState.attributes.sorteAtual}).`, { parse_mode: "Markdown" });
                    } else {
                        await bot.sendMessage(chatId, `Você teve sorte e conseguiu fugir!`, { parse_mode: "Markdown" });
                    }
                }

                if (canFlee) {
                    applyAttributeModifier(playerState, { atributo: "ENERGIA", valor: -2 }, bot, chatId);
                    if (fleeOption.efeito) {
                        handleGameEvent(playerState, fleeOption.efeito, bot, chatId);
                    }
                    playerState.combat = null;
                    savePlayerState(chatId, playerState);
                    await bot.sendMessage(chatId, `Você fugiu do combate, mas perdeu 2 de ENERGIA.`, { parse_mode: "Markdown" });
                    await displayGameSection(chatId, fleeOption.vai_para, bot, playerState);
                } else {
                    await sendCombatRoundMessage(chatId, bot, playerState);
                }
            } else if (combatAction === "use_luck") {
                await useLuckInCombat(chatId, bot, playerState);
            }
            return;
        }

        if (data.startsWith("test_luck_section_")) {
            const originalSectionId = data.split('_')[3];
            await handleLuckTest(chatId, bot, playerState, GAME_HISTORY[originalSectionId].teste_sorte);
            return;
        }
        if (data.startsWith("test_dice_section_")) {
            const originalSectionId = data.split('_')[3];
            await handleDiceTest(chatId, bot, playerState, GAME_HISTORY[originalSectionId].teste_dado);
            return;
        }
        if (data.startsWith("test_attribute_section_")) {
            const originalSectionId = data.split('_')[3];
            await handleAttributeTest(chatId, bot, playerState, GAME_HISTORY[originalSectionId].teste_atributo);
            return;
        }
        if (data.startsWith("test_repeated_luck_section_")) {
            const originalSectionId = data.split('_')[4];
            await handleRepeatedLuckTest(chatId, bot, playerState, GAME_HISTORY[originalSectionId].teste_sorte_repetido);
            return;
        }
        if (data === "test_repeated_luck") {
            const currentSection = playerState.currentSection;
            await handleRepeatedLuckTest(chatId, bot, playerState, GAME_HISTORY[currentSection].teste_sorte_repetido);
            return;
        }
        if (data.startsWith("bet_gold_")) {
            let amount = 0;
            if (data === "bet_gold_all") {
                amount = playerState.gold;
            } else {
                amount = parseInt(data.split('_')[2]);
            }

            if (playerState.gold < amount) {
                await bot.sendMessage(chatId, `Você não tem ${amount} ouro para apostar.`, { parse_mode: "Markdown" });
                await handleDiceGameBet(chatId, bot, playerState, GAME_HISTORY["130"].evento);
                return;
            }

            const playerRoll = rollDice(2, 6);
            const oldManRoll = rollDice(2, 6);
            let resultMessage = `Você apostou ${amount} ouro. Sua rolagem: ${playerRoll}. Rolagem do velho: ${oldManRoll}.\n`;

            if (playerRoll > oldManRoll) {
                playerState.gold += amount;
                resultMessage += `*Você ganhou ${amount} ouro!* Seu ouro atual: ${playerState.gold}.`;
                if (GAME_HISTORY["130"].evento.recompensa_vitoria) {
                    GAME_HISTORY["130"].evento.recompensa_vitoria.modificador_atributo.forEach(mod => {
                        applyAttributeModifier(playerState, mod, bot, chatId);
                    });
                }
            } else {
                playerState.gold -= amount;
                resultMessage += `*Você perdeu ${amount} ouro.* Seu ouro atual: ${playerState.gold}.`;
            }
            savePlayerState(chatId, playerState);
            await bot.sendMessage(chatId, resultMessage, { parse_mode: "Markdown" });
            await displayGameSection(chatId, "130", bot, playerState);
            return;
        }
        if (data === "card_game_honest" || data === "card_game_cheat") {
            let message = "";
            let success = false;

            if (data === "card_game_honest") {
                const roll = rollDice(2, 6);
                message += `Você jogou honestamente. Rolou ${roll} (Par ou Ímpar).\n`;
                success = (roll % 2 !== 0);
            } else {
                if (playerState.attributes.sorteAtual <= 0) {
                    await bot.sendMessage(chatId, "Você não tem sorte para trapacear.", { parse_mode: "Markdown" });
                    await handleCardGameLuck(chatId, bot, playerState, GAME_HISTORY["346"].evento);
                    return;
                }
                playerState.attributes.sorteAtual--;
                const luckRoll = rollDice(2, 6);
                message += `Você tentou trapacear. Teste de Sorte (Sorte atual: ${playerState.attributes.sorteAtual}). Rolou ${luckRoll}.\n`;
                success = (luckRoll <= playerState.attributes.sorteAtual);
            }

            if (success) {
                message += "*Você venceu no jogo de cartas!* Eles são amigáveis.";
                playerState.currentSection = "131";
            } else {
                message += "*Você perdeu no jogo de cartas!* Eles percebem a trapaça ou você simplesmente perdeu. Prepare-se!";
                playerState.currentSection = "20";
            }
            savePlayerState(chatId, playerState);
            await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
            await displayGameSection(chatId, playerState.currentSection, bot, playerState);
            return;
        }

        switch (data) {
            case "start_journey":
                playerState = {
                    attributes: {},
                    inventory: ["Espada", "Armadura de Couro", "Lanterna"],
                    provisions: 10,
                    gold: 0,
                    jewels: [],
                    potion: null,
                    currentSection: 'generate_attributes_habilidade',
                    combat: null,
                    temporaryModifiers: {},
                    knowledge: {},
                    cursedItems: [],
                    anotatedSection: null
                };
                savePlayerState(chatId, playerState);
                await bot.editMessageText(INTRO_TEXTS.attributeGeneration.habilidade.prompt, {
                    chat_id: chatId,
                    message_id: message.message_id,
                    reply_markup: {
                        inline_keyboard: [[{ text: INTRO_TEXTS.attributeGeneration.habilidade.buttonText, callback_data: "roll_d6_habilidade" }]]
                    },
                    parse_mode: "Markdown"
                });
                break;

            case "rumors":
                const optionsBelowRumors = {
                    reply_markup: { inline_keyboard: [[{ text: "Voltar", callback_data: "go_back_to_main_menu" }], [{ text: "Começar Jornada", callback_data: "start_journey" }]] },
                    parse_mode: "Markdown"
                };
                try {
                    await bot.editMessageText(INTRO_TEXTS.rumorsText, {
                        chat_id: chatId, message_id: message.message_id, ...optionsBelowRumors
                    });
                } catch (error) {
                    await bot.sendMessage(chatId, INTRO_TEXTS.rumorsText, optionsBelowRumors);
                }
                break;

            case "go_back_to_main_menu":
                try {
                    await bot.editMessageText(INTRO_TEXTS.welcomeMessage, {
                        chat_id: chatId,
                        message_id: message.message_id,
                        reply_markup: { inline_keyboard: [[{ text: "Começar a Jornada", callback_data: "start_journey" }], [{ text: "Boatos", callback_data: "rumors" }]] },
                        parse_mode: "Markdown"
                    });
                } catch (error) {
                    displayMainMenu(chatId, bot);
                }
                break;

            case "roll_d6_habilidade":
                if (playerState && playerState.currentSection === 'generate_attributes_habilidade') {
                    const roll = rollDice(1, 6);
                    playerState.attributes.habilidadeInicial = roll + 6;
                    playerState.attributes.habilidadeAtual = playerState.attributes.habilidadeInicial;
                    playerState.currentSection = 'generate_attributes_energia';
                    savePlayerState(chatId, playerState);
                    await bot.editMessageText(`Você rolou ${roll}. Sua *HABILIDADE* inicial é: *${playerState.attributes.habilidadeInicial}*.\n${INTRO_TEXTS.attributeGeneration.energia.prompt}`, {
                        chat_id: chatId,
                        message_id: message.message_id,
                        reply_markup: { inline_keyboard: [[{ text: INTRO_TEXTS.attributeGeneration.energia.buttonText, callback_data: "roll_2d6_energia" }]] },
                        parse_mode: "Markdown"
                    });
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
                    await bot.editMessageText(`Você rolou ${roll1} e ${roll2}. Sua *ENERGIA* inicial é: *${playerState.attributes.energiaInicial}*.\n${INTRO_TEXTS.attributeGeneration.sorte.prompt}`, {
                        chat_id: chatId,
                        message_id: message.message_id,
                        reply_markup: { inline_keyboard: [[{ text: INTRO_TEXTS.attributeGeneration.sorte.buttonText, callback_data: "roll_d6_sorte" }]] },
                        parse_mode: "Markdown"
                    });
                }
                break;

            case "roll_d6_sorte":
                if (playerState && playerState.currentSection === 'generate_attributes_sorte') {
                    const roll = rollDice(1, 6);
                    playerState.attributes.sorteInicial = roll + 6;
                    playerState.attributes.sorteAtual = playerState.attributes.sorteInicial;
                    playerState.currentSection = 'choose_potion';
                    savePlayerState(chatId, playerState);
                    await bot.editMessageText(INTRO_TEXTS.attributeGeneration.potionChoice, {
                        chat_id: chatId,
                        message_id: message.message_id,
                        reply_markup: { inline_keyboard: INTRO_TEXTS.attributeGeneration.potionOptions.map(option => [option]) },
                        parse_mode: "Markdown"
                    });
                }
                break;

            case "choose_potion_habilidade":
            case "choose_potion_forca":
            case "choose_potion_fortuna":
                if (playerState && playerState.currentSection === 'choose_potion') {
                    let potionName, potionType;
                    if (data.includes('habilidade')) {
                        potionName = 'Poção da Habilidade'; potionType = 'habilidade';
                    } else if (data.includes('forca')) {
                        potionName = 'Poção da Força'; potionType = 'forca';
                    } else {
                        potionName = 'Poção da Fortuna'; potionType = 'fortuna';
                    }
                    playerState.potion = { name: potionName, doses: 2, type: potionType };
                    playerState.currentSection = 'ready_to_start';
                    savePlayerState(chatId, playerState);

                    const confirmationMessage = `Você escolheu a *${potionName}*! Sua aventura está prestes a começar.\n\nCaso queira verificar sua ficha de personagem a qualquer momento, use o comando /ficha`;
                    
                    await bot.editMessageText(confirmationMessage, {
                        chat_id: chatId,
                        message_id: message.message_id,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: "Iniciar Aventura", callback_data: "begin_adventure" }]
                            ]
                        },
                        parse_mode: "Markdown"
                    });
                }
                break;
                
            case "begin_adventure":
                if (playerState && playerState.currentSection === 'ready_to_start') {
                    // Apaga a mensagem "Sua aventura está prestes a começar"
                    try {
                        await bot.deleteMessage(chatId, message.message_id);
                    } catch (error) {
                        console.error("Não foi possível apagar a mensagem:", error.message);
                        // Se falhar, edita a mensagem para limpá-la
                        await bot.editMessageText("Iniciando...", {
                             chat_id: chatId,
                             message_id: message.message_id,
                             reply_markup: null
                        }).catch(e => console.error("Falha ao editar a mensagem também:", e.message));
                    }

                    // Inicia a história na seção 1
                    playerState.currentSection = '1';
                    savePlayerState(chatId, playerState);
                    await displayGameSection(chatId, '1', bot, playerState);
                }
                break;

            default:
                if (data.startsWith("option_")) {
                    const nextSectionId = data.split('_')[1];
                    if (playerState) {
                        playerState.combat = null;
                        playerState.temporaryModifiers = {};
                        playerState.anotatedSection = null;
                        savePlayerState(chatId, playerState);
                        await displayGameSection(chatId, nextSectionId, bot, playerState);
                    } else {
                        await bot.sendMessage(chatId, INTRO_TEXTS.common.startNewGame);
                    }
                } else {
                    console.log(`Callback não tratado: ${data}.`);
                    await bot.sendMessage(chatId, INTRO_TEXTS.common.invalidChoice);
                }
                break;
        }
    });
}

module.exports = {
    registerCallbackHandlers
};

