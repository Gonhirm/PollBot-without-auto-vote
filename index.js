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

// Fonction pour afficher un timer toutes les 1/10e du temps dans le canal de suggestions
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

        isCombinedActive = true; // Active l'état combiné

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
            if (!isCombinedActive) return; // Stop si reset

            clearInterval(suggestionInterval);
            suggestChannel.send('⏰ Suggestion period is over. Starting voting...');

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
                if (!isCombinedActive) return; // Stop si reset
                clearInterval(votingInterval);
                isVotingActive = false;
                suggestChannel.send('⏰ Voting period is over. Use `!results` to see the results.');
                isCombinedActive = false; // Désactive l'état combiné
            }, durationVoting);
        }, durationSuggestions);
    }
});

// Commande pour afficher les résultats dans le canal de suggestions
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
