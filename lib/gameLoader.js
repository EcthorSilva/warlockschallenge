const fs = require('fs');
const path = require('path');

const GAME_DATA_DIR = path.join(__dirname, '..', 'game_data');
const HISTORY_PATH = path.join(GAME_DATA_DIR, 'history.json');
const INTRO_TEXTS_PATH = path.join(GAME_DATA_DIR, 'intro_texts.json');

let gameHistoryData = null;
let introTextsData = null;

/**
 * Carrega e retorna todos os dados do jogo do arquivo history.json.
 * Este arquivo contém todas as seções, monstros, etc.
 * @returns {object} O objeto contendo todos os dados do jogo.
 */
function loadGameHistoryData() {
    if (gameHistoryData) {
        return gameHistoryData;
    }
    if (fs.existsSync(HISTORY_PATH)) {
        try {
            gameHistoryData = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
            return gameHistoryData;
        } catch (e) {
            console.error(`Erro ao carregar dados do histórico do jogo de ${HISTORY_PATH}:`, e);
            process.exit(1);
        }
    } else {
        console.error(`ERRO: Arquivo de histórico do jogo não encontrado em ${HISTORY_PATH}`);
        process.exit(1);
    }
}

/**
 * Carrega e retorna os textos de introdução do arquivo intro_texts.json.
 * @returns {object} O objeto contendo os textos de introdução.
 */
function loadIntroTextsData() {
    if (introTextsData) {
        return introTextsData;
    }
    if (fs.existsSync(INTRO_TEXTS_PATH)) {
        try {
            introTextsData = JSON.parse(fs.readFileSync(INTRO_TEXTS_PATH, 'utf8'));
            return introTextsData;
        } catch (e) {
            console.error(`Erro ao carregar textos de introdução de ${INTRO_TEXTS_PATH}:`, e);
            process.exit(1);
        }
    } else {
        console.error(`ERRO: Arquivo de textos de introdução não encontrado em ${INTRO_TEXTS_PATH}`);
        process.exit(1);
    }
}

loadGameHistoryData();
loadIntroTextsData();

module.exports = {
    GAME_HISTORY: gameHistoryData,
    INTRO_TEXTS: introTextsData
};