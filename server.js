require('dotenv').config(); 

const express = require('express');
const bodyParser = require('body-parser');
const { bot } = require('./config/telegramBot');
const { registerCommandHandlers } = require('./handlers/commandHandlers');
const { registerCallbackHandlers } = require('./handlers/callbackHandlers');

const app = express();
app.use(bodyParser.json());

registerCommandHandlers(bot);
registerCallbackHandlers(bot);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor Express rodando na porta ${PORT}`);
    console.log('Bot do Feiticeiro da Montanha de Fogo iniciado. Digite /start no Telegram para interagir.');
});

console.log('Modo de operação: Polling. O bot está buscando atualizações do Telegram.');