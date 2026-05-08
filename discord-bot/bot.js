// ══════════════════════════════════════════════════════════════════
//  AgricFi Discord Faucet Bot
//  Sends devnet SOL to users who submit their Solana wallet address
//  in the #get-test-sol channel
// ══════════════════════════════════════════════════════════════════

import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  Events,
  ActivityType,
} from 'discord.js';
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';

// ── CONFIG ─────────────────────────────────────────────────────────
const CONFIG = {
  token:          process.env.DISCORD_TOKEN,
  faucetChannel:  process.env.FAUCET_CHANNEL_ID,
  guildId:        process.env.GUILD_ID,
  adminRoleId:    process.env.ADMIN_ROLE_ID,
  privateKey:     process.env.FAUCET_PRIVATE_KEY,
  solAmount:      parseFloat(process.env.SOL_AMOUNT || '1'),
  cooldownHours:  parseInt(process.env.COOLDOWN_HOURS || '24'),
  rpc:            process.env.SOLANA_RPC || 'https://api.devnet.solana.com',
  dbFile:         './requests.json',
};

// ── VALIDATE ENV ────────────────────────────────────────────────────
const required = ['DISCORD_TOKEN', 'FAUCET_CHANNEL_ID', 'GUILD_ID', 'FAUCET_PRIVATE_KEY'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`❌ Missing required env var: ${key}`);
    console.error('Copy .env.example to .env and fill in your values.');
    process.exit(1);
  }
}

// ── SOLANA SETUP ────────────────────────────────────────────────────
const connection = new Connection(CONFIG.rpc, 'confirmed');

function loadFaucetWallet() {
  try {
    const secretKey = Buffer.from(CONFIG.privateKey, 'base58');
    return Keypair.fromSecretKey(secretKey);
  } catch (e) {
    // Try JSON array format as fallback
    try {
      const keyArray = JSON.parse(CONFIG.privateKey);
      return Keypair.fromSecretKey(Uint8Array.from(keyArray));
    } catch (e2) {
      console.error('❌ Invalid FAUCET_PRIVATE_KEY format. Use base58 or JSON array.');
      process.exit(1);
    }
  }
}

const faucetWallet = loadFaucetWallet();
console.log(`✅ Faucet wallet loaded: ${faucetWallet.publicKey.toBase58()}`);

// ── REQUEST DATABASE (simple JSON file) ────────────────────────────
// In production, replace with a real DB like PostgreSQL or Firebase
function loadDB() {
  if (!existsSync(CONFIG.dbFile)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG.dbFile, 'utf8'));
  } catch {
    return {};
  }
}

function saveDB(db) {
  writeFileSync(CONFIG.dbFile, JSON.stringify(db, null, 2));
}

function getCooldownKey(userId, walletAddress) {
  return `${userId}:${walletAddress}`;
}

function isOnCooldown(userId, walletAddress) {
  const db = loadDB();
  const key = getCooldownKey(userId, walletAddress);
  const lastRequest = db[key];
  if (!lastRequest) return false;
  const hoursAgo = (Date.now() - lastRequest) / (1000 * 60 * 60);
  return hoursAgo < CONFIG.cooldownHours;
}

function setCooldown(userId, walletAddress) {
  const db = loadDB();
  db[getCooldownKey(userId, walletAddress)] = Date.now();

  // Also track by wallet address alone (prevent one wallet from multiple users)
  db[`wallet:${walletAddress}`] = Date.now();
  saveDB(db);
}

function isWalletOnCooldown(walletAddress) {
  const db = loadDB();
  const lastRequest = db[`wallet:${walletAddress}`];
  if (!lastRequest) return false;
  const hoursAgo = (Date.now() - lastRequest) / (1000 * 60 * 60);
  return hoursAgo < CONFIG.cooldownHours;
}

// ── SOLANA HELPERS ──────────────────────────────────────────────────
function isValidSolanaAddress(address) {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

async function getFaucetBalance() {
  const balance = await connection.getBalance(faucetWallet.publicKey);
  return balance / LAMPORTS_PER_SOL;
}

async function sendDevnetSOL(recipientAddress, amount) {
  const recipient = new PublicKey(recipientAddress);
  const lamports = Math.round(amount * LAMPORTS_PER_SOL);

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: faucetWallet.publicKey,
      toPubkey:   recipient,
      lamports,
    })
  );

  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [faucetWallet],
    { commitment: 'confirmed' }
  );

  return signature;
}

// ── EXTRACT SOLANA ADDRESS FROM MESSAGE ─────────────────────────────
function extractSolanaAddress(content) {
  // Solana addresses are base58 encoded, 32-44 characters
  const pattern = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;
  const matches = content.match(pattern) || [];

  // Filter to valid Solana public keys
  return matches.find(m => isValidSolanaAddress(m)) || null;
}

// ── DISCORD CLIENT ──────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Message, Partials.Channel],
});

// ── BOT READY ───────────────────────────────────────────────────────
client.once(Events.ClientReady, async (c) => {
  console.log(`\n✅ AgricFi Bot is online as: ${c.user.tag}`);
  console.log(`   Faucet wallet: ${faucetWallet.publicKey.toBase58()}`);

  try {
    const balance = await getFaucetBalance();
    console.log(`   Faucet balance: ${balance.toFixed(4)} SOL (devnet)`);
    if (balance < CONFIG.solAmount * 5) {
      console.warn(`⚠️  Low faucet balance! Fund with: solana airdrop 10 ${faucetWallet.publicKey.toBase58()} --url devnet`);
    }
  } catch (e) {
    console.warn('⚠️  Could not fetch faucet balance:', e.message);
  }

  // Set bot activity
  c.user.setActivity('AgricFi Devnet Faucet', { type: ActivityType.Watching });
  console.log(`\n📡 Watching channel: ${CONFIG.faucetChannel}`);
  console.log('═══════════════════════════════════════\n');
});

// ── MESSAGE HANDLER ─────────────────────────────────────────────────
client.on(Events.MessageCreate, async (message) => {
  // Ignore bots
  if (message.author.bot) return;

  // ── ADMIN COMMANDS (work in any channel for bot owner/admin role) ──
  const isAdmin = message.member?.roles.cache.has(CONFIG.adminRoleId) ||
                  message.guild?.ownerId === message.author.id;

  if (message.content.startsWith('!agric')) {
    const args = message.content.split(' ').slice(1);
    const cmd = args[0]?.toLowerCase();

    // !agric balance
    if (cmd === 'balance') {
      try {
        const balance = await getFaucetBalance();
        message.reply(`🏦 Faucet balance: **${balance.toFixed(4)} devnet SOL**\n📍 \`${faucetWallet.publicKey.toBase58()}\``);
      } catch (e) {
        message.reply(`❌ Could not fetch balance: ${e.message}`);
      }
      return;
    }

    // !agric stats (admin only)
    if (cmd === 'stats' && isAdmin) {
      const db = loadDB();
      const total = Object.keys(db).filter(k => k.includes(':')).length;
      const wallets = Object.keys(db).filter(k => k.startsWith('wallet:')).length;
      message.reply(`📊 **Faucet Stats**\nTotal requests: **${total}**\nUnique wallets: **${wallets}**`);
      return;
    }

    // !agric refund (admin only — topped up notification)
    if (cmd === 'refund' && isAdmin) {
      message.reply(`To fund the faucet wallet, run:\n\`\`\`\nsolana airdrop 10 ${faucetWallet.publicKey.toBase58()} --url devnet\n\`\`\``);
      return;
    }

    // !agric help
    if (cmd === 'help') {
      const embed = new EmbedBuilder()
        .setColor(0x00ff87)
        .setTitle('AgricFi Faucet Bot — Commands')
        .setDescription('Post your Solana wallet address in <#' + CONFIG.faucetChannel + '> to receive devnet SOL.')
        .addFields(
          { name: '!agric balance', value: 'Check faucet wallet balance', inline: true },
          { name: '!agric help',    value: 'Show this help message',      inline: true },
        )
        .setFooter({ text: 'AgricFi MVP · Solana Devnet' });
      message.reply({ embeds: [embed] });
      return;
    }
  }

  // ── FAUCET CHANNEL ONLY ────────────────────────────────────────────
  if (message.channelId !== CONFIG.faucetChannel) return;

  const content = message.content.trim();
  const walletAddress = extractSolanaAddress(content);

  // No wallet address found
  if (!walletAddress) {
    // Only reply if the message looks like an attempt
    if (content.length > 10 && !content.startsWith('!')) {
      const embed = new EmbedBuilder()
        .setColor(0xff4d6d)
        .setTitle('Invalid Wallet Address')
        .setDescription(`No valid Solana wallet address found in your message.\n\nPlease post **only your Solana wallet address** in this channel.\n\nExample:\n\`\`\`\n5xKj3mNpQrT7vBkY2WoLd8sR4HcF9nGZeXuJwA1MP6i\n\`\`\``)
        .setFooter({ text: 'AgricFi MVP · Solana Devnet' });
      const reply = await message.reply({ embeds: [embed] });
      // Auto-delete after 10 seconds to keep channel clean
      setTimeout(() => reply.delete().catch(() => {}), 10000);
    }
    return;
  }

  // Check cooldown by wallet address
  if (isWalletOnCooldown(walletAddress)) {
    const db = loadDB();
    const lastRequest = db[`wallet:${walletAddress}`];
    const hoursLeft = Math.ceil(CONFIG.cooldownHours - (Date.now() - lastRequest) / (1000 * 60 * 60));
    const embed = new EmbedBuilder()
      .setColor(0xf0c040)
      .setTitle('Cooldown Active')
      .setDescription(`This wallet has already received devnet SOL.\n\n⏳ You can request again in **${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}**.\n\n**Wallet:** \`${walletAddress.slice(0,6)}...${walletAddress.slice(-6)}\``)
      .setFooter({ text: 'AgricFi MVP · Solana Devnet' });
    const reply = await message.reply({ embeds: [embed] });
    setTimeout(() => reply.delete().catch(() => {}), 15000);
    return;
  }

  // Check cooldown by user
  if (isOnCooldown(message.author.id, walletAddress)) {
    const embed = new EmbedBuilder()
      .setColor(0xf0c040)
      .setTitle('Already Requested')
      .setDescription(`You have already received devnet SOL recently.\n\nCooldown: **${CONFIG.cooldownHours} hours** between requests.`)
      .setFooter({ text: 'AgricFi MVP · Solana Devnet' });
    const reply = await message.reply({ embeds: [embed] });
    setTimeout(() => reply.delete().catch(() => {}), 15000);
    return;
  }

  // ── CHECK FAUCET BALANCE ────────────────────────────────────────────
  let faucetBalance;
  try {
    faucetBalance = await getFaucetBalance();
  } catch (e) {
    console.error('Balance check failed:', e);
    message.reply('❌ Unable to check faucet balance. Try again in a moment.');
    return;
  }

  if (faucetBalance < CONFIG.solAmount) {
    const embed = new EmbedBuilder()
      .setColor(0xff4d6d)
      .setTitle('Faucet Empty')
      .setDescription(`The faucet is temporarily out of devnet SOL. Please try again later.\n\nFor urgent testing, you can get devnet SOL from:\n• [Solana Faucet](https://faucet.solana.com)\n• [QuickNode Faucet](https://faucet.quicknode.com/solana/devnet)`)
      .setFooter({ text: 'AgricFi MVP · Solana Devnet' });
    message.reply({ embeds: [embed] });
    return;
  }

  // ── SEND DEVNET SOL ─────────────────────────────────────────────────
  // Send processing message
  const processingEmbed = new EmbedBuilder()
    .setColor(0x4d9fff)
    .setTitle('Processing...')
    .setDescription(`Sending **${CONFIG.solAmount} devnet SOL** to your wallet...\n\n⚙️ Confirming on Solana devnet...`)
    .setFooter({ text: 'AgricFi MVP · Solana Devnet' });
  const processingMsg = await message.reply({ embeds: [processingEmbed] });

  try {
    const signature = await sendDevnetSOL(walletAddress, CONFIG.solAmount);
    const txUrl = `https://explorer.solana.com/tx/${signature}?cluster=devnet`;

    // Record the request
    setCooldown(message.author.id, walletAddress);

    // Log to console
    console.log(`✅ Sent ${CONFIG.solAmount} SOL → ${walletAddress}`);
    console.log(`   TX: ${signature}`);
    console.log(`   User: ${message.author.tag} (${message.author.id})`);

    // Success embed
    const successEmbed = new EmbedBuilder()
      .setColor(0x00ff87)
      .setTitle('Devnet SOL Sent!')
      .setDescription(`**${CONFIG.solAmount} SOL** has been sent to your wallet on Solana devnet.`)
      .addFields(
        {
          name: 'Wallet Address',
          value: `\`${walletAddress.slice(0,8)}...${walletAddress.slice(-8)}\``,
          inline: false,
        },
        {
          name: 'Amount Sent',
          value: `**${CONFIG.solAmount} devnet SOL**`,
          inline: true,
        },
        {
          name: 'Network',
          value: 'Solana Devnet',
          inline: true,
        },
        {
          name: 'Transaction',
          value: `[View on Explorer](${txUrl})\n\`${signature.slice(0,20)}...\``,
          inline: false,
        },
        {
          name: 'Next Steps',
          value: `1. Return to [AgricFi App](https://agricfi-app.netlify.app)\n2. Connect your wallet (Phantom/Solflare)\n3. Browse and invest in tokenized farms\n4. Your balance: **${CONFIG.solAmount} SOL** ✅`,
          inline: false,
        },
      )
      .setThumbnail('https://i.ibb.co/k4DmBjD/agricfi-logo.png')
      .setFooter({ text: `AgricFi MVP · Sent by AgricFi Bot · ${new Date().toUTCString()}` })
      .setTimestamp();

    await processingMsg.edit({ embeds: [successEmbed] });

    // Add a checkmark reaction
    await message.react('✅').catch(() => {});

  } catch (error) {
    console.error(`❌ Failed to send SOL to ${walletAddress}:`, error);

    const errorEmbed = new EmbedBuilder()
      .setColor(0xff4d6d)
      .setTitle('Transaction Failed')
      .setDescription(`Failed to send devnet SOL. Please try again.\n\n**Error:** ${error.message || 'Unknown error'}\n\nAlternatively, get devnet SOL from:\n• [Solana Faucet](https://faucet.solana.com)\n• [QuickNode Faucet](https://faucet.quicknode.com/solana/devnet)`)
      .setFooter({ text: 'AgricFi MVP · Solana Devnet' });

    await processingMsg.edit({ embeds: [errorEmbed] });
  }
});

// ── ERROR HANDLING ──────────────────────────────────────────────────
client.on(Events.Error, (error) => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down AgricFi bot...');
  client.destroy();
  process.exit(0);
});

// ── LOGIN ───────────────────────────────────────────────────────────
console.log('🌾 Starting AgricFi Faucet Bot...');
client.login(CONFIG.token);
