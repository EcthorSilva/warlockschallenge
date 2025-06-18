const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
    console.error("ERRO: O token do bot do Telegram não foi encontrado nas variáveis de ambiente.");
    console.error("Certifique-se de ter um arquivo '.env' na raiz do projeto com a linha: TELEGRAM_BOT_TOKEN=SEU_TOKEN_AQUI");
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

module.exports = {
    bot
};