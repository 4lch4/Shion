import { type ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js'

export const pingCommand = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Replies with Pong!'),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.reply('Pong pong!')
  },
}
