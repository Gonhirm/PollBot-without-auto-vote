const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const { REST, Routes } = require('discord.js');

const CLIENT_ID = '1317953766074486784'; // ID de votre bot
const TOKEN = process.env.TOKEN; // Votre token Discord

if (!CLIENT_ID || !TOKEN) {
    console.error("❌ CLIENT_ID or TOKEN is missing. Ensure they are set in the environment variables.");
    process.exit(1); // Exit the process if critical data is missing
}

const commands = [
    {
        name: 'start-voting-predefined',
        description: 'Start a voting session with predefined suggestions.',
        options: [
            {
                name: 'duration',
                type: 3, // STRING
                description: 'Duration of the voting session (e.g., 1h30m).',
                required: true,
            },
            {
                name: 'suggestions',
                type: 3, // STRING
                description: 'Predefined suggestions in the format: Suggestion - Username.',
                required: true,
            },
        ],
    },
    {
        name: 'results',
        description: 'Display the results of the last voting session.',
    },
    {
        name: 'set-suggest-channel',
        description: 'Set the channel for automatic suggestions.',
        options: [
            {
                name: 'channel',
                type: 7, // CHANNEL
                description: 'Channel to set for suggestions.',
                required: true,
            },
        ],
    },
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log('🔄 Refreshing application (global) commands...');

        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });

        console.log('✅ Successfully reloaded application (global) commands.');
    } catch (error) {
        console.error('❌ Failed to reload application commands. Error:', error.code || 'Unknown code', error.message || 'No message provided');
        if (error.response?.data) {
            console.error('📋 Response Data:', JSON.stringify(error.response.data, null, 2));
        }
    }
})();

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;

    if (commandName === 'start-voting-predefined') {
        const durationInput = options.getString('duration');
        const suggestionsInput = options.getString('suggestions');

        const duration = parseTime(durationInput);
        if (!duration) {
            return interaction.reply({ content: '❌ Invalid time format. Use `xxdxxhxxm`.', ephemeral: true });
        }

        const inputLines = suggestionsInput.split('\n');
        const predefinedSuggestions = {};
        for (const line of inputLines) {
            const [suggestion, username] = line.split(' - ');
            if (!suggestion || !username) {
                return interaction.reply({ content: `❌ Invalid format: "${line}". Use "Suggestion - Username".`, ephemeral: true });
            }
            predefinedSuggestions[suggestion.trim()] = username.trim();
        }

        const suggestChannel = client.channels.cache.get(suggestChannelID);
        if (!suggestChannel) {
            return interaction.reply({ content: '❌ Suggest channel is not set. Use `/set-suggest-channel` first.', ephemeral: true });
        }

        Object.keys(predefinedSuggestions).forEach((suggestion, index) => {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`vote_${index}`)
                    .setLabel(suggestion)
                    .setStyle(ButtonStyle.Primary)
            );

            suggestChannel.send({
                content: `🗳 **Voting Option ${index + 1}:**`,
                components: [row],
            });
        });

        interaction.reply({ content: `✅ Predefined voting started for ${durationInput}.`, ephemeral: true });
    }

    if (commandName === 'results') {
        const suggestChannel = client.channels.cache.get(suggestChannelID);
        if (!suggestChannel) {
            return interaction.reply({ content: '❌ Suggest channel is not set. Use `/set-suggest-channel` first.', ephemeral: true });
        }

        if (Object.keys(votes).length === 0) {
            return suggestChannel.send('❌ No votes have been recorded.');
        }

        const voteCounts = {};
        Object.entries(suggestions).forEach(([suggestion]) => {
            voteCounts[suggestion] = 0;
        });

        Object.values(votes).forEach((voteList) => {
            voteList.forEach((vote) => {
                if (voteCounts[vote] !== undefined) {
                    voteCounts[vote]++;
                }
            });
        });

        const sortedResults = Object.entries(voteCounts).sort(([, a], [, b]) => b - a);
        let resultsMessage = '🏆 **Poll Results** 🗳\n\n';

        sortedResults.forEach(([suggestion, count]) => {
            resultsMessage += `- **${suggestion}** : ${count} vote(s)\n`;
        });

        suggestChannel.send(resultsMessage);
        interaction.reply({ content: '✅ Results have been sent to the suggest channel.', ephemeral: true });
    }

    if (commandName === 'set-suggest-channel') {
        const channel = options.getChannel('channel');
        if (channel.type !== ChannelType.GuildText) {
            return interaction.reply({ content: '❌ The channel must be a text channel.', ephemeral: true });
        }
        

        suggestChannelID = channel.id;
        interaction.reply({ content: `✅ Suggestions will now be automatically collected in <#${channel.id}>.` });
    }
});

const POLL_MANAGEMENT_CHANNEL_ID = '1318327808514195556'; // Salon d'interface de commandes
let suggestChannelID = null; // Salon pour suggestions automatiques
const suggestions = {}; // Stocke les suggestions avec auteur
const votes = {}; // Stocke les votes des utilisateurs
const activeTimers = {}; // Gestion des timers (suggestions, votes)

// Gestion centralisée des fichiers
function loadFileSync(filename, defaultData = {}) {
    try {
        if (!fs.existsSync(filename)) {
            console.log(`⚠️ ${filename} not found. Creating a new one.`);
            fs.writeFileSync(filename, JSON.stringify(defaultData, null, 2));
            return defaultData;
        }
        return JSON.parse(fs.readFileSync(filename));
    } catch (error) {
        console.error(`❌ Error reading or parsing ${filename}:`, error.message);
        console.log(`⚠️ Resetting ${filename} to default data.`);
        return defaultData;
    }
}

function saveFileSync(filename, data) {
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
}

function log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

// Fonction utilitaire pour charger un fichier JSON en toute sécurité
function loadFileSync(filepath, defaultValue) {
    try {
        if (fs.existsSync(filepath)) {
            const data = fs.readFileSync(filepath, 'utf8');
            return JSON.parse(data);
        } else {
            console.log(`⚠️ File not found: ${filepath}. A new one will be created.`);
        }
    } catch (error) {
        console.error(`❌ Error parsing JSON from file ${filepath}:`, error.message);
        console.log(`⚠️ Resetting ${filepath} to default value.`);
    }
    return defaultValue; // Retourne la valeur par défaut en cas d'erreur
}

// Charger les suggestions et votes au démarrage
Object.assign(suggestions, loadFileSync('suggestions.json'));
Object.assign(votes, loadFileSync('votes.json'));

function saveSuggestions() {
    saveFileSync('suggestions.json', suggestions);
}

function saveVotes() {
    saveFileSync('votes.json', votes);
}

// Fonction pour vérifier si la commande vient du salon poll-management
function isPollManagementChannel(message) {
    return message.channel.id === POLL_MANAGEMENT_CHANNEL_ID;
}

// Commande pour définir le canal des suggestions automatiques
client.on('messageCreate', (message) => {
    if (!isPollManagementChannel(message)) return;

    if (message.content.startsWith('!set-suggest-channel')) {
        const channelID = message.content.split(' ')[1];
        const channel = client.channels.cache.get(channelID);

        if (!channel || channel.type !== 0) { // Use numeric type for Discord.js v14
            return message.reply('❌ Invalid channel ID or the channel is not a text channel.');
        }

        suggestChannelID = channelID;
        message.reply(`✅ Suggestions will now be automatically collected in <#${channelID}>.`);
    }
});

// Gestion des suggestions des utilisateurs
client.on('messageCreate', (message) => {
    if (message.author.bot || !suggestChannelID || !activeTimers.suggestions) return;

    if (message.channel.id === suggestChannelID) {
        const suggestion = message.content.trim().toLowerCase();
        if (!suggestion) return;

        if (Object.keys(suggestions).map((s) => s.toLowerCase()).includes(suggestion)) {
            return message.reply('❌ This suggestion already exists.');
        }

        if (Object.keys(suggestions).length >= 100) {
            return message.reply('❌ The maximum number of suggestions (100) has been reached.');
        }

        const userSuggestions = Object.entries(suggestions).filter(([, userId]) => userId === message.author.id);
        if (userSuggestions.length >= 3) {
            return message.reply('❌ You can only submit up to 3 suggestions.');
        }

        suggestions[suggestion] = message.author.id;
        saveSuggestions();
        message.reply(`✅ Your suggestion has been added: **${message.content.trim()}**`);
    }
});

// Fonction générique pour gérer les périodes avec compte à rebours
async function startPeriod(channel, type, duration, onFinish) {
    if (activeTimers[type]) {
        channel.send(`❌ A ${type} period is already active.`);
        return;
    }

    const endTime = Date.now() + duration;
    let notified = false;
    let countdownMessage = await channel.send(`⏳ ${type} period started for ${formatDuration(duration)}.`);

    const interval = setInterval(async () => {
        const timeLeft = Math.max(0, endTime - Date.now());
        if (timeLeft <= 0) {
            clearInterval(interval);
            delete activeTimers[type];
            try {
                await countdownMessage.edit(`⏰ ${type.charAt(0).toUpperCase() + type.slice(1)} period is over.`);
            } catch (error) {
                log(`Error updating countdown message: ${error}`);
            }
            onFinish();
        } else {
            const formattedTime = formatDuration(timeLeft);
            try {
                await countdownMessage.edit(`⏳ Time remaining: ${formattedTime}`);
            } catch (error) {
                log(`Error updating countdown message: ${error}`);
            }

            if (timeLeft <= 60000 && !notified) {
                notified = true;
                channel.send('⚠️ Less than 1 minute remaining!');
            }
        }
    }, 5000);

    activeTimers[type] = { interval, countdownMessage };
}

function stopPeriod(type, channel) {
    if (!activeTimers[type]) {
        channel.send(`❌ No active ${type} period to stop.`);
        return;
    }

    clearInterval(activeTimers[type].interval);
    delete activeTimers[type];
    channel.send(`🛑 ${type.charAt(0).toUpperCase() + type.slice(1)} period has been manually stopped.`);
}

// Commande pour démarrer une période de suggestions
client.on('messageCreate', (message) => {
    if (!isPollManagementChannel(message)) return;

    if (message.content.startsWith('!start-suggestions')) {
        const duration = parseTime(message.content.split(' ')[1]);
        if (!duration) {
            return message.reply('❌ Invalid time format. Use `xxdxxhxxm`.');
        }

        const suggestChannel = client.channels.cache.get(suggestChannelID);
        startPeriod(suggestChannel, 'suggestions', duration, () => {
            suggestChannel.send('⏰ Suggestion period has ended.');
        });
    }
});

// Commande pour arrêter une période de suggestions
client.on('messageCreate', (message) => {
    if (!isPollManagementChannel(message)) return;

    if (message.content === '!stop-suggestions') {
        const suggestChannel = client.channels.cache.get(suggestChannelID);
        stopPeriod('suggestions', suggestChannel);
    }
});

// Commande pour démarrer une période de votes
client.on('messageCreate', (message) => {
    if (!isPollManagementChannel(message)) return;

    if (message.content.startsWith('!start-voting')) {
        const duration = parseTime(message.content.split(' ')[1]);
        if (!duration) {
            return message.reply('❌ Invalid time format. Use `xxdxxhxxm`.');
        }

        const suggestChannel = client.channels.cache.get(suggestChannelID);
        startPeriod(suggestChannel, 'voting', duration, () => {
            suggestChannel.send('⏰ Voting period has ended. Use `!results` to see the results.');
        });
    }
});

// Commande pour arrêter une période de votes
client.on('messageCreate', (message) => {
    if (!isPollManagementChannel(message)) return;

    if (message.content === '!stop-voting') {
        const suggestChannel = client.channels.cache.get(suggestChannelID);
        stopPeriod('voting', suggestChannel);
    }
});

// Commande pour démarrer une période de votes avec des suggestions prédéfinies
client.on('messageCreate', async (message) => {
    if (!isPollManagementChannel(message)) return;

    if (message.content.startsWith('!start-voting-predefined')) {
        if (!suggestChannelID) {
            return message.reply('❌ You must first set a suggestion channel using `!set-suggest-channel`.');
        }

        // Validation des données d'entrée
        const inputLines = message.content.split('\n').slice(1);
        if (inputLines.length === 0) {
            return message.reply('❌ You must provide suggestions in the format: `Suggestion - Username`.');
        }

        const predefinedSuggestions = {};
        for (const line of inputLines) {
            const [suggestion, username] = line.split(' - ');
            if (!suggestion || !username) {
                return message.reply(`❌ Invalid format: "${line}". Use "Suggestion - Username".`);
            }

            if (Object.keys(predefinedSuggestions).includes(suggestion.trim().toLowerCase())) {
                return message.reply(`❌ Duplicate suggestion: "${suggestion}". Each suggestion must be unique.`);
            }

            const member = message.guild.members.cache.find(m => m.user.username === username.trim());
            if (!member) {
                return message.reply(`❌ User "${username}" not found in this server.`);
            }

            predefinedSuggestions[suggestion.trim()] = member.user.username;
        }

        // Si tout va bien, démarrez le vote
        const suggestChannel = client.channels.cache.get(suggestChannelID);
        Object.keys(predefinedSuggestions).forEach((suggestion, index) => {
            // Créer une rangée unique pour chaque bouton
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`vote_${index}`)
                    .setLabel(`${suggestion}`) // Affiche uniquement le texte de la suggestion
                    .setStyle(ButtonStyle.Primary)
            );

            // Envoyer chaque bouton individuellement
            suggestChannel.send({
                content: `🗳 **Voting Option ${index + 1}:**`,
                components: [row],
            });
        });

        // Envoyer les suggestions avec boutons
        rows.forEach((row, i) => {
            suggestChannel.send({
                content: `🗳 **Predefined Voting - Page ${i + 1}**`,
                components: [row],
            });
        });

        // Définir la période de vote
        const duration = parseTime(message.content.split(' ')[1]); // Durée incluse dans la commande
        if (!duration) return message.reply('❌ Invalid time format. Use `xxdxxhxxm`.');

        const endTime = Date.now() + duration;

        // Compte à rebours pour la période de votes
        let countdownMessage = null;
        suggestChannel.send('🗳 Predefined voting has started.').then(async (msg) => {
            countdownMessage = msg;
            const interval = setInterval(() => {
                const timeLeft = Math.max(0, endTime - Date.now());
                if (timeLeft <= 0) {
                    clearInterval(interval);
                    countdownMessage.edit('⏰ Voting period is over.');
                } else {
                    countdownMessage.edit(`⏳ Time remaining: ${formatDuration(timeLeft)}`);
                }
            }, 5000);

            votingTimer = setTimeout(() => {
                isVotingActive = false;
                suggestChannel.send('⏰ Voting period has ended. Use `!results` to see the results.');
            }, duration);
        });
    }
});

// Gestion des interactions avec les boutons de vote
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const [action, index] = interaction.customId.split('_');
    if (action === 'vote') {
        const suggestion = Object.keys(suggestions)[index];

        if (!votes[interaction.user.id]) votes[interaction.user.id] = [];

        if (votes[interaction.user.id].includes(suggestion)) {
            return interaction.reply({ content: '❌ You have already voted for this suggestion.', ephemeral: true });
        }

        if (votes[interaction.user.id].length >= 3) {
            return interaction.reply({ content: '❌ You can only vote for up to 3 suggestions.', ephemeral: true });
        }

        votes[interaction.user.id].push(suggestion);
        saveVotes();

        await interaction.reply({ content: `✅ You voted for: **${suggestion}**`, ephemeral: true });
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
        Object.entries(suggestions).forEach(([suggestion, userId]) => {
            voteCounts[suggestion] = 0; // Initialize all suggestions with 0 votes
        });

        Object.values(votes).forEach((voteList) => {
            voteList.forEach((vote) => {
                if (voteCounts[vote] !== undefined) {
                    voteCounts[vote]++;
                }
            });
        });

        // Sort results primarily by votes (descending) and secondarily by suggestion order
        const sortedResults = Object.entries(voteCounts).sort(([suggestionA, countA], [suggestionB, countB]) => {
            if (countB === countA) {
                // Secondary sort by suggestion order in the original `suggestions` object
                return Object.keys(suggestions).indexOf(suggestionA) - Object.keys(suggestions).indexOf(suggestionB);
            }
            return countB - countA;
        });

        let resultsMessage = '🏆 **Poll Results** 🗳\n\n';
        let maxVotes = sortedResults[0][1];

        sortedResults.forEach(([suggestion, count]) => {
            resultsMessage += `- **${suggestion}** : ${count} vote(s)\n`;
        });

        const topSuggestions = sortedResults.filter(([, count]) => count === maxVotes);
        if (topSuggestions.length > 1) {
            resultsMessage += '\n🤝 **It\'s a tie between:** ';
            resultsMessage += topSuggestions.map(([suggestion]) => `**${suggestion}**`).join(', ');
        } else {
            resultsMessage += `\n🏅 **Winner:** ${topSuggestions[0][0]}`;
        }

        fs.writeFileSync('results.json', JSON.stringify(voteCounts, null, 2));
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

function formatDuration(ms) {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const seconds = Math.floor((ms / 1000) % 60);
    return `${hours}h ${minutes}m ${seconds}s`;
}

const { SlashCommandBuilder } = require('@discordjs/builders');

// Définition de la commande /help
const helpCommand = new SlashCommandBuilder()
    .setName('help')
    .setDescription('Lists all available commands and their usage.');

module.exports = {
    data: helpCommand,
    async execute(interaction) {
        // Vérifie que la commande est utilisée dans le bon canal
        if (interaction.channel.id !== POLL_MANAGEMENT_CHANNEL_ID) {
            return interaction.reply({
                content: `❌ This command can only be used in the #Poll-management channel.`,
                ephemeral: true,
            });
        }

        // Liste des commandes et leur utilisation
        const commandDescriptions = `
        **Available Commands:**

        1. **/set-suggest-channel**:
           - Description: Sets the channel where suggestions will be collected.
           - Usage: \`/set-suggest-channel <channel-id>\`

        2. **/start-suggestions**:
           - Description: Starts a suggestion period for users to submit ideas.
           - Usage: \`/start-suggestions <duration>\` (e.g., `10m`, `1h`, `1d`).

        3. **/stop-suggestions**:
           - Description: Stops the current suggestion period manually.
           - Usage: \`/stop-suggestions\`

        4. **/start-voting-predefined**:
           - Description: Starts a voting period with predefined suggestions.
           - Usage: \`/start-voting-predefined <duration>\` and provide suggestions in the format:
             \`\`\`
             Suggestion 1 - Username
             Suggestion 2 - Username
             \`\`\`

        5. **/stop-voting**:
           - Description: Stops the current voting period manually.
           - Usage: \`/stop-voting\`

        6. **/results**:
           - Description: Displays the results of the voting session.
           - Usage: \`/results\`

        7. **/help**:
           - Description: Lists all available commands and their usage.
           - Usage: \`/help\`
        `;

        // Répond à l'utilisateur avec la liste des commandes
        await interaction.reply({
            content: commandDescriptions,
            ephemeral: true, // Visible uniquement par l'utilisateur qui a tapé la commande
        });
    },
};

// Connexion du bot
client.login(process.env.TOKEN);
