// lib/playerState.js
const fs = require('fs');
const path = require('path');

const PLAYER_STATES_DIR = path.join(__dirname, '..', 'data', 'player_states');

if (!fs.existsSync(PLAYER_STATES_DIR)) {
    fs.mkdirSync(PLAYER_STATES_DIR, { recursive: true });
}

function getPlayerFilePath(chatId) {
    return path.join(PLAYER_STATES_DIR, `${chatId}.json`);
}

function loadPlayerState(chatId) {
    const filePath = getPlayerFilePath(chatId);
    if (fs.existsSync(filePath)) {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (e) {
            console.error(`Erro ao carregar estado do jogador ${chatId}:`, e);
            // Retorna um estado nulo para que um novo estado possa ser criado.
            return null;
        }
    }
    // Retorna uma estrutura inicial de playerState se não existir
    return {
        currentSection: null,
        attributes: {},
        inventory: [],
        provisions: 0,
        potion: null,
        gold: 0,
        jewels: [],
        combat: null,
        temporaryModifiers: {}
    };
}

function savePlayerState(chatId, state) {
    const filePath = getPlayerFilePath(chatId);
    if (state) {
        fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
    } else {
        console.warn(`Tentativa de salvar um estado nulo/vazio para o jogador ${chatId}. Ignorado.`);
    }
}

function deletePlayerState(chatId) {
    const filePath = getPlayerFilePath(chatId);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
    }
    return false;
}

module.exports = {
    loadPlayerState,
    savePlayerState,
    deletePlayerState
};