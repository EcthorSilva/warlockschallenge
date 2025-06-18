/**
 * Simula a rolagem de um ou mais dados.
 * @param {number} numDice - O número de dados a serem rolados.
 * @param {number} sides - O número de lados de cada dado (ex: 6 para d6).
 * @returns {number} A soma dos resultados das rolagens.
 */
function rollDice(numDice, sides) {
    let total = 0;
    for (let i = 0; i < numDice; i++) {
        total += Math.floor(Math.random() * sides) + 1;
    }
    return total;
}

module.exports = {
    rollDice
};