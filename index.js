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

// Fonction pour afficher un timer toutes les 1/10e du temps dans le canal défini
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

// Commande pour démarrer une période de suggestions
client.on('messageCreate', (message) => {
    if (!isPollManagementChannel(message)) return;

    if (message.content.startsWith('!start-suggestions')) {
        if (!suggestChannelID) {
            return message.reply('❌ You must first set a suggestion channel using `!set-suggest-channel`.');
        }

        const duration = parseTime(message.content.split(' ')[1]);
        if (!duration) return message.reply('❌ Invalid time format. Use `xxdxxhxxm`.');

        const suggestChannel = client.channels.cache.get(suggestChannelID);

        suggestionEndTime = Date.now() + duration;
        suggestChannel.send(`🕒 Suggestion period started for ${message.content.split(' ')[1]}.`);

        suggestionInterval = displayCountdown(
            suggestChannel,
            suggestionEndTime,
            duration,
            '⏰ Suggestion period has ended.'
        );
        suggestionTimer = setTimeout(() => {
            clearInterval(suggestionInterval);
            suggestChannel.send('⏰ Suggestion period is over.');
        }, duration);
    }
});

// Commande pour stopper une période de suggestions
client.on('messageCreate', (message) => {
    if (!isPollManagementChannel(message)) return;

    if (message.content === '!stop-suggestions') {
        clearTimeout(suggestionTimer);
        clearInterval(suggestionInterval);
        suggestionEndTime = null;
        message.reply('🛑 Suggestion period has been stopped.');
    }
});

// Commande pour démarrer une période de votes
client.on('messageCreate', (message) => {
    if (!isPollManagementChannel(message)) return;

    if (message.content.startsWith('!start-voting')) {
        if (!suggestChannelID) {
            return message.reply('❌ You must first set a suggestion channel using `!set-suggest-channel`.');
        }

        const duration = parseTime(message.content.split(' ')[1]);
        if (!duration) return message.reply('❌ Invalid time format. Use `xxdxxhxxm`.');

        const suggestChannel = client.channels.cache.get(suggestChannelID);

        votingEndTime = Date.now() + duration;
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

        suggestChannel.send({
            content: '🗳 **Voting has started!** Vote for a suggestion below:',
            components: rows,
        });

        votingInterval = displayCountdown(
            suggestChannel,
            votingEndTime,
            duration,
            '⏰ Voting period has ended. Use `!results` to see the results.'
        );

        votingTimer = setTimeout(() => {
            clearInterval(votingInterval);
            isVotingActive = false;
            suggestChannel.send('⏰ Voting period is over. Use `!results` to see the results.');
        }, duration);
    }
});

// Commande pour stopper une période de votes
client.on('messageCreate', (message) => {
    if (!isPollManagementChannel(message)) return;

    if (message.content === '!stop-voting') {
        clearTimeout(votingTimer);
        clearInterval(votingInterval);
        votingEndTime = null;
        isVotingActive = false;
        message.reply('🛑 Voting period has been stopped.');
    }
});

// Commande combinée pour suggestions + votes
client.on('messageCreate', (message) => {
    if (!isPollManagementChannel(message)) return;

    if (message.content.startsWith('!start-suggestions-voting')) {
        if (!suggestChannelID) {
            return message.reply('❌ You must first set a suggestion channel using `!set-suggest-channel`.');
        }

        const args = message.content.split(' ').slice(1);
        const durationSuggestions = parseTime(args[0]);
        const durationVoting = parseTime(args[1]);

        if (!durationSuggestions || !durationVoting) {
            return message.reply('❌ Invalid time format. Use `xxdxxhxxm` for both durations.');
        }

        const suggestChannel = client.channels.cache.get(suggestChannelID);

        isCombinedActive = true;

        // Démarre la période de suggestions
        suggestChannel.send(`🕒 Starting suggestion period for ${args[0]}...`);
        suggestionEndTime = Date.now() + durationSuggestions;

        suggestionInterval = displayCountdown(
            suggestChannel,
            suggestionEndTime,
            durationSuggestions,
            '⏰ Suggestion period has ended. Starting voting period...'
        );

        suggestionTimer = setTimeout(() => {
            if (!isCombinedActive) return;

            clearInterval(suggestionInterval);
            suggestChannel.send('⏰ Suggestion period is over. Starting voting...');

            // Démarre la période de votes
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

            suggestChannel.send({
                content: '🗳 **Voting has started!** Vote for a suggestion below:',
                components: rows,
            });

            votingInterval = displayCountdown(
                suggestChannel,
                votingEndTime,
                durationVoting,
                '⏰ Voting period has ended. Use `!results` to see the results.'
            );

            votingTimer = setTimeout(() => {
                if (!isCombinedActive) return;

                clearInterval(votingInterval);
                isVotingActive = false;
                suggestChannel.send('⏰ Voting period is over. Use `!results` to see the results.');
                isCombinedActive = false;
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

// Commande pour afficher les résultats
client.on('messageCreate', (message) => {
    if (!isPollManagementChannel(message)) return;

    if (message.content === '!results') {
        if (!suggestChannelID) {
            return message.reply('❌ You must first set a suggestion channel using `!set-suggest-channel`.');
        }

        const suggestChannel = client.channels.cache.get(suggestChannelID);

        if (Object.keys(votes).length === 0) {
            return suggestChannel.send('❌ No votes have been recorded.');
        }

        const voteCounts = {};
        Object.values(votes).forEach((voteList) => {
            voteList.forEach((vote) => {
                if (!voteCounts[vote]) voteCounts[vote] = 0;
                voteCounts[vote]++;
            });
        });

        let resultsMessage = '🏆 **Poll Results** 🗳\n\n';
        Object.entries(voteCounts).forEach(([suggestion, count]) => {
            resultsMessage += `- **${suggestion}** : ${count} vote(s)\n`;
        });

        suggestChannel.send(resultsMessage);
    }
});

// Commande pour réinitialiser toutes les données
client.on('messageCreate', (message) => {
    if (message.content === '!reset') {
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
