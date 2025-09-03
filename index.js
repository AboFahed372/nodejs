import dotenv from 'dotenv';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import fs from 'fs';

dotenv.config({ path: 'ENV.env' });

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error('Missing DISCORD_TOKEN in ENV.env');
  process.exit(1);
}

const DATA_PATH = 'data.json';

function readData() {
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return { roleIdAllowed: null, userPoints: {}, replyConfig: null };
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages]
});

// Commands
const commands = [
  new SlashCommandBuilder()
    .setName('بانل')
    .setDescription('بانل اداري لإدارة النقاط')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('تعيين-رتبة')
    .setDescription('تعيين رتبة مخولة لإعطاء النقاط')
    .addRoleOption(o => o.setName('الرتبة').setDescription('الرتبة المصرح لها').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder()
    .setName('تعيين-رد')
    .setDescription('إعداد رد تفاعلي بزر يعرض الرد ونص/رابط (اختياري)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
].map(c => c.toJSON());

// Register commands
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  const appId = client.application.id;
  await rest.put(Routes.applicationCommands(appId), { body: commands });
  console.log('✅ Registered global commands');
}

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  try { 
    await registerCommands(); 
  } catch (e) { 
    console.error('❌ Command registration failed:', e.message); 
  }
});

// Helpers
function hasAllowedRole(member) {
  const data = readData();
  if (!data.roleIdAllowed) return false;
  return member.roles.cache.has(data.roleIdAllowed);
}

function formatPointsEmbed(senderTag, points) {
  return new EmbedBuilder()
    .setTitle('🎉 تم منح نقاط')
    .setDescription(`تم منحك **${points}** نقاط`)
    .setFooter({ text: `المُرسل: ${senderTag}` })
    .setColor(0x2ecc71);
}

// Interactions
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'بانل') {
        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('admin_menu')
            .setPlaceholder('اختر إجراء')
            .addOptions([
              { label: 'إعطاء نقاط إدارية', value: 'give_points' },
              { label: 'عرض النقاط لمستخدم', value: 'view_points' }
            ])
        );
        await interaction.reply({ content: '🎛️ **بانل إداري:**', components: [row], ephemeral: true });
      }
      
      if (interaction.commandName === 'تعيين-رتبة') {
        const role = interaction.options.getRole('الرتبة');
        const data = readData();
        data.roleIdAllowed = role.id;
        writeData(data);
        await interaction.reply({ content: `✅ تم تعيين الرتبة المخولة: ${role}`, ephemeral: true });
      }
      
      if (interaction.commandName === 'تعيين-رد') {
        const data = readData();
        data.replyConfig = { text: null, media: null };
        writeData(data);
        
        const button = new ButtonBuilder()
          .setCustomId('show_reply')
          .setStyle(ButtonStyle.Primary)
          .setLabel('إظهار الرد');
          
        const setupButton = new ButtonBuilder()
          .setCustomId('configure_reply')
          .setStyle(ButtonStyle.Secondary)
          .setLabel('تعديل الرد');
          
        const row1 = new ActionRowBuilder().addComponents(setupButton);
        const row2 = new ActionRowBuilder().addComponents(button);
        
        await interaction.reply({ 
          content: '✅ تم إنشاء زر الرد. اضغط "تعديل الرد" لضبط النص/الرابط.', 
          components: [row1, row2] 
        });
      }
    }
    
    else if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'admin_menu') {
        const selected = interaction.values[0];
        if (selected === 'give_points') {
          const modal = new ModalBuilder().setCustomId('give_points_modal').setTitle('إعطاء نقاط');
          const userIdInput = new TextInputBuilder()
            .setCustomId('target_user_id')
            .setLabel('ID المستخدم')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('123456789012345678');
          const pointsInput = new TextInputBuilder()
            .setCustomId('points_amount')
            .setLabel('عدد النقاط')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('100');
          modal.addComponents(
            new ActionRowBuilder().addComponents(userIdInput), 
            new ActionRowBuilder().addComponents(pointsInput)
          );
          await interaction.showModal(modal);
        } 
        else if (selected === 'view_points') {
          const modal = new ModalBuilder().setCustomId('view_points_modal').setTitle('عرض نقاط مستخدم');
          const userIdInput = new TextInputBuilder()
            .setCustomId('target_user_id')
            .setLabel('ID المستخدم')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('123456789012345678');
          modal.addComponents(new ActionRowBuilder().addComponents(userIdInput));
          await interaction.showModal(modal);
        }
      }
    }
    
    else if (interaction.isModalSubmit()) {
      if (interaction.customId === 'give_points_modal') {
        const data = readData();
        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (!hasAllowedRole(member)) {
          await interaction.reply({ content: '❌ ليس لديك صلاحية إعطاء النقاط.', ephemeral: true });
          return;
        }
        const userId = interaction.fields.getTextInputValue('target_user_id');
        const amtRaw = interaction.fields.getTextInputValue('points_amount');
        const amount = Number(amtRaw);
        if (!userId || !Number.isFinite(amount) || amount <= 0) {
          await interaction.reply({ content: '❌ إدخال غير صالح.', ephemeral: true });
          return;
        }
        data.userPoints[userId] = (data.userPoints[userId] || 0) + amount;
        writeData(data);
        await interaction.reply({ content: `✅ تم منح ${amount} نقاط للمستخدم ${userId}.`, ephemeral: true });
        try {
          const user = await client.users.fetch(userId);
          await user.send({ embeds: [formatPointsEmbed(interaction.user.tag, amount)] });
        } catch (e) {
          console.log('Could not DM user:', userId);
        }
      }
      
      if (interaction.customId === 'view_points_modal') {
        const data = readData();
        const userId = interaction.fields.getTextInputValue('target_user_id');
        const points = data.userPoints[userId] || 0;
        await interaction.reply({ content: `📊 نقاط المستخدم ${userId}: **${points}**`, ephemeral: true });
      }
      
      if (interaction.customId === 'set_reply_modal') {
        const text = interaction.fields.getTextInputValue('reply_text');
        const media = interaction.fields.getTextInputValue('reply_media');
        const data = readData();
        data.replyConfig = { text: text || null, media: media || null };
        writeData(data);
        await interaction.reply({ content: '✅ تم حفظ إعداد الرد.', ephemeral: true });
      }
    }
    
    else if (interaction.isButton()) {
      if (interaction.customId === 'show_reply') {
        const data = readData();
        const parts = [];
        if (data.replyConfig?.text) parts.push(data.replyConfig.text);
        if (data.replyConfig?.media) parts.push(data.replyConfig.media);
        const content = parts.length ? parts.join('\n') : '❌ لا يوجد رد محدد.';
        await interaction.reply({ content, ephemeral: true });
      }
      
      if (interaction.customId === 'configure_reply') {
        const modal = new ModalBuilder().setCustomId('set_reply_modal').setTitle('تعيين الرد');
        const textInput = new TextInputBuilder()
          .setCustomId('reply_text')
          .setLabel('نص الرد')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setPlaceholder('اكتب النص هنا...');
        const mediaInput = new TextInputBuilder()
          .setCustomId('reply_media')
          .setLabel('رابط صورة/نص إضافي (اختياري)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('https://example.com/image.jpg');
        modal.addComponents(
          new ActionRowBuilder().addComponents(textInput), 
          new ActionRowBuilder().addComponents(mediaInput)
        );
        await interaction.showModal(modal);
      }
    }
  } catch (err) {
    console.error('Interaction error:', err);
    if (interaction.isRepliable()) {
      try { 
        await interaction.reply({ content: '❌ حدث خطأ غير متوقع.', ephemeral: true }); 
      } catch (_) {}
    }
  }
});

client.login(TOKEN);