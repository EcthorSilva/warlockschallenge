/**
 * Constrói a mensagem formatada da ficha de aventura do jogador.
 * @param {object} playerState - O estado atual do jogador.
 * @returns {string} A mensagem formatada da ficha.
 */

function escapeMarkdownV2(text) {
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

function buildPlayerSheetMessage(playerState) {
    const attributes = playerState.attributes || {};
    const inventory = playerState.inventory || [];
    const jewels = playerState.jewels || [];
    const potion = playerState.potion || null;

    const sheet = `
FICHA DE AVENTURA

*HABILIDADE:* ${attributes.habilidadeAtual} / ${attributes.habilidadeInicial}
*ENERGIA:* ${attributes.energiaAtual} / ${attributes.energiaInicial}
*SORTE:* ${attributes.sorteAtual} / ${attributes.sorteInicial}

*PROVISÕES:* ${playerState.provisions}
*OURO:* ${playerState.gold} 
*JÓIAS:* ${escapeMarkdownV2(jewels.length ? jewels.map(j => j.name).join(', ') : 'Nenhuma')}
*POÇÃO:* ${escapeMarkdownV2(potion ? `${potion.name} / ${potion.doses} doses` : 'Nenhuma')}
*ITENS:* ${escapeMarkdownV2(inventory.length ? inventory.join(', ') : 'Nenhum')}
`.trim();

    return sheet;
}

module.exports = {
    buildPlayerSheetMessage
};