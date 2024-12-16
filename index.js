const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

let suggestions = {}; // Stores suggestions with the author
let votes = {}; // Stores user votes
let isSuggestionPhaseActive = false; // Track if suggestions are open
let isVotingPhaseActive = false; // Track if voting is open

// Utility function to parse time strings like "1d2h30m"
function parseTimeString(timeString) {
    const timeRegex = /(\d+d)?(\d+h)?(\d+m)?/; // Matches patterns like "1d2h30m"
    const match = timeString.match(timeRegex);

    if (!match) {
        return null;
    }

    const days = parseInt(match[1]) || 0;
    const hours = parseInt(match[2]) || 0;
    const minutes = parseInt(match[3]) || 0;

    return (days * 86400000) + (hours * 3600000) + (minutes * 60000); // Convert to milliseconds
}

// Event when the bot is ready
client.once('ready', () => {
    console.log(`✅ Bot connected as ${client.user.tag}`);
});

// Command to start the suggestion phase
client.on('messageCreate', async (message) => {
    if (message.content.startsWith('!start-suggestions')) {
        const args = message.content.split(' ');
        const duration = parseTimeString(args[1]); // Parse duration like "1d2h30m"

        if (!duration) {
            return message.reply('❌ Invalid time format. Use `!start-suggestions 1d2h30m` for 1 day, 2 hours, and 30 minutes.');
        }

        if (isSuggestionPhaseActive || isVotingPhaseActive) {
            return message.reply('❌ A poll process is already active. Please wait until it ends.');
        }

        isSuggestionPhaseActive = true;
        suggestions = {}; // Reset suggestions
        votes = {}; // Reset votes

        message.reply(`✅ The suggestion phase has started! You have ${args[1]} to submit your suggestions with \`!suggest [your idea]\`.`);

        setTimeout(() => {
            isSuggestionPhaseActive = false;
            message.channel.send('⏳ The suggestion phase has ended. No more suggestions can be submitted.');
        }, duration);
    }
});

// Command to add a suggestion (accessible to everyone during the suggestion phase)
client.on('messageCreate', (message) => {
    if (message.content.startsWith('!suggest')) {
        if (!isSuggestionPhaseActive) {
            return message.reply('❌ Suggestions are currently closed.');
        }

        const suggestion = message.content.slice(9).trim();

        if (!suggestion) {
            return message.reply('❌ Please provide a suggestion after `!suggest`.');
        }

        if (Object.values(suggestions).includes(suggestion)) {
            return message.reply('❌ This suggestion already exists.');
        }

        suggestions[suggestion] = message.author.id;
        message.reply(`✅ Suggestion added: "${suggestion}"`);
    }
});

// Command to start the voting phase
client.on('messageCreate', async (message) => {
    if (message.content.startsWith('!start-voting')) {
        const args = message.content.split(' ');
        const duration = parseTimeString(args[1]); // Parse duration like "1d2h30m"

        if (!duration) {
            return message.reply('❌ Invalid time format. Use `!start-voting 1d2h30m` for 1 day, 2 hours, and 30 minutes.');
        }

        if (isVotingPhaseActive) {
            return message.reply('❌ Voting is already active.');
        }

        if (Object.keys(suggestions).length === 0) {
            return message.reply("❌ No suggestions have been added.");
        }

        isVotingPhaseActive = true;

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

        await message.channel.send({
            content: '🗳 **The voting phase has started! Click a button to vote for your favorite suggestion.**',
            components: rows,
        });

        setTimeout(() => {
            isVotingPhaseActive = false;
            message.channel.send('⏳ The voting phase has ended. Displaying the results now...');
            displayResults(message);
        }, duration);
    }
});

// Handle voting (accessible to everyone during the voting phase)
client.on('interactionCreate', (interaction) => {
    if (!interaction.isButton()) return;

    if (!isVotingPhaseActive) {
        return interaction.reply({
            content: '❌ Voting is currently closed.',
            ephemeral: true,
        });
    }

    const [action, index] = interaction.customId.split('_');
    if (action === 'vote') {
        const suggestionKeys = Object.keys(suggestions);
        const suggestion = suggestionKeys[index];
        const authorId = suggestions[suggestion];

        if (authorId === interaction.user.id) {
            return interaction.reply({
                content: '❌ You cannot vote for your own suggestion.',
                ephemeral: true,
            });
        }

        if (!votes[interaction.user.id]) {
            votes[interaction.user.id] = [];
        }

        if (votes[interaction.user.id].includes(suggestion)) {
            return interaction.reply({
                content: '❌ You have already voted for this suggestion.',
                ephemeral: true,
            });
        }

        votes[interaction.user.id].push(suggestion);
        interaction.reply({
            content: `✅ You voted for: "${suggestion}"`,
            ephemeral: true,
        });
    }
});

// Function to display poll results
function displayResults(message) {
    const voteCounts = {};

    // Count votes
    Object.values(votes).forEach((voteList) => {
        voteList.forEach((vote) => {
            if (!voteCounts[vote]) voteCounts[vote] = 0;
            voteCounts[vote]++;
        });
    });

    if (Object.keys(voteCounts).length === 0) {
        return message.channel.send("❌ No votes have been recorded.");
    }

    let resultsMessage = '🏆 **Poll Results** 🗳\n\n';
    Object.entries(voteCounts).forEach(([suggestion, count]) => {
        resultsMessage += `- **${suggestion}**: ${count} vote(s)\n`;
    });

    message.channel.send(resultsMessage);
}

// Connect the bot
client.login(process.env.TOKEN);

