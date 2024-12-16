const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const POLL_MANAGEMENT_CHANNEL_ID = '1318327808514195556'; // ID du salon poll-management
let suggestChannelID = null; // ID du salon pour suggestions automatiques
const suggestions = {}; // Stocke les suggestions avec l'auteur
const votes = {}; // Stocke les votes

let suggestionTimer = null;
let votingTimer = null;
let suggestionInterval = null;
let votingInterval = null;

let suggestionEndTime = null;
let votingEndTime = null;
let isVotingActive = false;
let isCombinedActive = false; // État pour !start-suggestions-voting

// Fonction pour vérifier si la commande vient du salon poll-management
function isPollManagementChannel(message) {
    return message.channel.id === POLL_MANAGEMENT_CHANNEL_ID;
}

// Fonction pour afficher un timer toutes les 1/10e du temps
function displayCountdown(channel, endTime, duration, message) {
    const intervalTime = duration / 10;

    const interval = setInterval(() => {
        const timeLeft = Math.max(0, endTime - Date.now());
        const minutes = Math.floor((timeLeft / 1000 / 60) % 60);
        const seconds = Math.floor((timeLeft / 1000) % 60);

        if (timeLeft <= 0) {
            clearInterval(interval);
            channel.send(message);
        } else {
            channel.send(`⏳ **Time remaining:** ${minutes}m ${seconds}s`);
        }
    }, intervalTime);

    return interval;
}

// Commande pour définir le salon des suggestions automatiques
client.on('messageCreate', (message) => {
    if (!isPollManagementChannel(message)) return;

    if (message.content.startsWith('!set-suggest-channel')) {
        const channelID = message.content.split(' ')[1];
        if (!channelID) return message.reply('❌ Please provide a valid channel ID.');

        suggestChannelID = channelID;
        message.reply(`✅ Suggestions will now be automatically collected in <#${channelID}>.`);
    }
});

// Commande combinée pour suggestions + votes
client.on('messageCreate', (message) => {
    if (!isPollManagementChannel(message)) return;

    if (message.content.startsWith('!start-suggestions-voting')) {
        const args = message.content.split(' ').slice(1);
        const durationSuggestions = parseTime(args[0]);
        const durationVoting = parseTime(args[1]);

        if (!durationSuggestions || !durationVoting) {
            return message.reply('❌ Invalid time format. Use `xxdxxhxxm` for both durations.');
        }

        isCombinedActive = true; // Active l'état combiné

        // Démarre la période de suggestions
        message.reply(`🕒 Starting suggestion period for ${args[0]}...`);
        suggestionEndTime = Date.now() + durationSuggestions;

        suggestionInterval = displayCountdown(
            message.channel,
            suggestionEndTime,
            durationSuggestions,
            '⏰ Suggestion period has ended. Starting voting period...'
        );

        suggestionTimer = setTimeout(() => {
            if (!isCombinedActive) return; // Stop si reset

            clearInterval(suggestionInterval);
            message.channel.send('⏰ Suggestion period is over. Starting voting...');

            // Démarre automatiquement la période de votes
            votingEndTime = Date.now() + durationVoting;
            isVotingActive = true;

            const rows = [];
            Object.keys(suggestions).forEach((suggestion, index) => {
                rows.push(
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`vote_${index}`)
                            .setLabel(suggestion)
                            .setStyle(ButtonStyle.Primary)
                    )
                );
            });

            message.channel.send({
                content: '🗳 **Voting has started!** Vote for a suggestion below:',
                components: rows,
            });

            votingInterval = displayCountdown(
                message.channel,
                votingEndTime,
                durationVoting,
                '⏰ Voting period has ended. Use `!results` to see the results.'
            );

            votingTimer = setTimeout(() => {
                if (!isCombinedActive) return; // Stop si reset
                clearInterval(votingInterval);
                isVotingActive = false;
                message.channel.send('⏰ Voting period is over. Use `!results` to see the results.');
                isCombinedActive = false; // Désactive l'état combiné
            }, durationVoting);
        }, durationSuggestions);
    }
});

// Commande pour stopper la période combinée suggestions + votes
client.on('messageCreate', (message) => {
    if (!isPollManagementChannel(message)) return;

    if (message.content === '!stop-suggestions-voting') {
        if (!isCombinedActive) {
            return message.reply('❌ There is no active combined session to stop.');
        }

        clearTimeout(suggestionTimer);
        clearTimeout(votingTimer);
        clearInterval(suggestionInterval);
        clearInterval(votingInterval);

        suggestionTimer = null;
        votingTimer = null;
        suggestionInterval = null;
        votingInterval = null;
        isVotingActive = false;
        isCombinedActive = false;

        message.reply('🛑 Combined suggestions and voting session has been stopped.');
    }
});

// Commande pour suggestions classiques
client.on('messageCreate', (message) => {
    if (message.channel.id === suggestChannelID && !isVotingActive && !message.author.bot) {
        const suggestion = message.content.trim();
        if (!suggestion) return;

        suggestions[suggestion] = message.author.id;
        message.reply(`✅ Suggestion added: "${suggestion}"`);
    }
});

// Commande pour reset toutes les données
client.on('messageCreate', (message) => {
    if (message.content === '!reset') {
        // Arrête tous les timers et intervalles
        clearTimeout(suggestionTimer);
        clearTimeout(votingTimer);
        clearInterval(suggestionInterval);
        clearInterval(votingInterval);

        Object.keys(suggestions).forEach((key) => delete suggestions[key]);
        Object.keys(votes).forEach((key) => delete votes[key]);

        suggestionTimer = null;
        votingTimer = null;
        suggestionInterval = null;
        votingInterval = null;

        suggestionEndTime = null;
        votingEndTime = null;
        isVotingActive = false;
        isCombinedActive = false;

        message.reply('🛑 All functions have been stopped, and all data has been reset.');
    }
});

// Fonction pour convertir le temps
function parseTime(input) {
    const regex = /(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?/;
    const matches = input.match(regex);
    if (!matches) return null;

    const [, days = 0, hours = 0, minutes = 0] = matches.map(Number);
    return (days * 86400 + hours * 3600 + minutes * 60) * 1000;
}

// Connexion du bot
client.login(process.env.TOKEN);
