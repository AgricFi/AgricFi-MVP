import { Connection, clusterApiUrl, PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

// ══════════════════════════════════════════════════════════════
//  AgricFi MVP — Standalone Native Wallet Manager v6
//  Decoupled completely from Reown/AppKit/CDN architectures
// ══════════════════════════════════════════════════════════════

const STORAGE_KEY       = 'agricfi_wallet_session';
const CRYPTO_KEY        = 'agricfi_dapp_secret';
const APP_URL           = 'https://agricfi.xyz'; // Updates canonical app origin

// ── Live Blockchain Connection Pipeline ────────────────────────
const rpcUrl = clusterApiUrl('devnet');
const connection = new Connection(rpcUrl, 'confirmed');

// ── Internal State ─────────────────────────────────────────────
let _ws = { connected: false, address: null, name: null, session: null };

// ══════════════════════════════════════════════════════════════
//  PROVIDER RESOLVER
// ══════════════════════════════════════════════════════════════

function getProvider(id) {
  if (id === 'phantom') return window.phantom?.solana || window.solana?.isPhantom ? (window.phantom?.solana || window.solana) : null;
  if (id === 'solflare') return window.solflare?.isSolflare ? window.solflare : null;
  if (id === 'backpack') return window.backpack?.isBackpack ? window.backpack : null;
  return null;
}

// ══════════════════════════════════════════════════════════════
//  CONNECTION ENGINE (DESKTOP & MOBILE CORES)
// ══════════════════════════════════════════════════════════════

async function connectWallet(id) {
  const provider = getProvider(id);
  const names = { phantom: 'Phantom', solflare: 'Solflare', backpack: 'Backpack' };
  const name = names[id] || id;

  // ── CASE 1: Desktop Extensions or Extension-backed Mobile Browsers
  if (provider) {
    showToast('info', 'Connecting...', `Approve request in ${name}`);
    try {
      await provider.connect();
      const address = provider.publicKey.toString();
      
      _ws = { connected: true, address, name, session: null };
      saveSession();
      updateWalletUI();
      showToast('success', 'Connected!', `${name}: ${fmtAddr(address)}`);
      
      if (typeof onWalletConnected === 'function') onWalletConnected(_ws);
      closeWalletModal();
      
      provider.on?.('disconnect', handleDisconnectState);
    } catch (err) {
      handleError(err);
    }
  } else {
    // ── CASE 2: Standard Mobile Browsers (Chrome/Safari Connect & Return)
    // Generate an asymmetric keypair to handle end-to-end link encryption
    const dappKeyPair = nacl.box.keyPair();
    
    // Persist the secret key in localStorage so it survives the browser redirect refresh
    localStorage.setItem(CRYPTO_KEY, bs58.encode(dappKeyPair.secretKey));
    
    const baseRedirect = window.location.origin + window.location.pathname;
    const dappPubKeyStr = bs58.encode(dappKeyPair.publicKey);

    // Build the wallet-agnostic deep link payload map
    const fallbackUrls = {
      phantom: `https://phantom.app/ul/v1/connect?app_url=${encodeURIComponent(APP_URL)}&redirect_link=${encodeURIComponent(baseRedirect)}&dapp_encryption_public_key=${dappPubKeyStr}&cluster=devnet`,
      solflare: `https://solflare.com/ul/v1/connect?app_url=${encodeURIComponent(APP_URL)}&redirect_link=${encodeURIComponent(baseRedirect)}&dapp_encryption_public_key=${dappPubKeyStr}&cluster=devnet`,
      backpack: `https://backpack.app/ul/v1/connect?app_url=${encodeURIComponent(APP_URL)}&redirect_link=${encodeURIComponent(baseRedirect)}&dapp_encryption_public_key=${dappPubKeyStr}&cluster=devnet`
    };
    
    if (!fallbackUrls[id]) {
      showToast('error', 'Unsupported', 'Wallet deep-linking standard not configured.');
      return;
    }

    showToast('info', `Opening ${name}...`, 'Redirecting to your mobile wallet secure prompt.');
    localStorage.setItem('agricfi_pending_wallet', id);
    
    setTimeout(() => {
      window.location.href = fallbackUrls[id];
    }, 600);
  }
}

// ══════════════════════════════════════════════════════════════
//  MOBILE REDIRECT HANDLER & DECRYPTION PASSTHROUGH
// ══════════════════════════════════════════════════════════════

function checkMobileRedirectParams() {
  const urlParams = new URLSearchParams(window.location.search);
  const data = urlParams.get('data');
  const nonce = urlParams.get('nonce');
  
  // Find out which specific wallet identity key came back
  const walletEncryptionPubKey = urlParams.get('phantom_encryption_public_key') || 
                                 urlParams.get('solflare_encryption_public_key') ||
                                 urlParams.get('backpack_encryption_public_key');

  if (!data || !nonce || !walletEncryptionPubKey) return;

  try {
    const savedSecretStr = localStorage.getItem(CRYPTO_KEY);
    if (!savedSecretStr) throw new Error('Missing encryption session reference.');

    const dappSecretKey = bs58.decode(savedSecretStr);
    const walletPubKeyBytes = bs58.decode(walletEncryptionPubKey);

    // Decrypt the response envelope
    const decryptedBytes = nacl.box.open(
      bs58.decode(data),
      bs58.decode(nonce),
      walletPubKeyBytes,
      dappSecretKey
    );

    if (!decryptedBytes) throw new Error('Decryption handshake failure.');

    const payload = JSON.parse(new TextDecoder().decode(decryptedBytes));
    const walletNameId = localStorage.getItem('agricfi_pending_wallet') || 'Wallet';
    const cleanName = walletNameId.charAt(0).toUpperCase() + walletNameId.slice(1);

    _ws = {
      connected: true,
      address: payload.public_key,
      name: cleanName,
      session: payload.session, // Crucial token used downstream to sign mobile actions
      walletEncryptionPubKey: walletEncryptionPubKey // Store to build signature payloads later
    };

    saveSession();
    updateWalletUI();
    cleanUrlParameters();
    
    showToast('success', 'Connected!', `${cleanName}: ${fmtAddr(payload.public_key)}`);
    if (typeof onWalletConnected === 'function') onWalletConnected(_ws);

  } catch (err) {
    console.error('[AgricFi Decryption Error]:', err);
    showToast('error', 'Handshake Failed', 'Could not authenticate deep link response data.');
    cleanUrlParameters();
  }
}

// ══════════════════════════════════════════════════════════════
//  SESSION PERSISTENCE & LIFECYCLE MANAGEMENT
// ══════════════════════════════════════════════════════════════

function saveSession() {
  if (!_ws.connected) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(_ws));
}

async function restoreWallet() {
  // Check if we are landing back from a fresh mobile handshake first
  checkMobileRedirectParams();
  
  if (_ws.connected) return;

  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;
  
  try {
    const parsed = JSON.parse(saved);
    const provider = getProvider(parsed.name.toLowerCase());
    
    if (provider) {
      try {
        await provider.connect({ onlyIfTrusted: true });
        _ws = { connected: true, address: provider.publicKey.toString(), name: parsed.name, session: null };
        provider.on?.('disconnect', handleDisconnectState);
      } catch (e) {
        _ws = parsed; // Retain cached profile data if standard silent re-auth is blocked
      }
    } else {
      _ws = parsed;
    }
    updateWalletUI();
    if (typeof onWalletConnected === 'function') onWalletConnected(_ws);
  } catch (e) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function handleDisconnectState() {
  _ws = { connected: false, address: null, name: null, session: null };
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(CRYPTO_KEY);
  localStorage.removeItem('agricfi_pending_wallet');
  updateWalletUI();
  if (typeof onWalletDisconnected === 'function') onWalletDisconnected();
}

async function disconnectWallet() {
  if (_ws.connected && !_ws.session) {
    const provider = getProvider(_ws.name.toLowerCase());
    try { if (provider) await provider.disconnect?.(); } catch (e) {}
  }
  handleDisconnectState();
  showToast('info', 'Disconnected', 'Wallet session cleared.');
}

// ══════════════════════════════════════════════════════════════
//  INTERFACE RENDERING & UTILITIES
// ══════════════════════════════════════════════════════════════

function openWalletModal() {
  const opts = document.getElementById('walletOpts');
  if (opts) opts.innerHTML = buildNativeOpts();
  const modal = document.getElementById('walletModal');
  if (modal) modal.classList.add('open');
}

function closeWalletModal() {
  document.getElementById('walletModal')?.classList.remove('open');
}

function buildNativeOpts() {
  const WALLETS = [
    {
      id: 'phantom',
      name: 'Phantom',
      desc: 'Connect with your Phantom Wallet',
      detected: !!(window.phantom?.solana || window.solana?.isPhantom),
      icon: `<svg width="36" height="36" viewBox="0 0 36 36"><rect width="36" height="36" rx="10" fill="#ab9ff2"/><path d="M28 18c0 5.5-4.5 10-10 10S8 23.5 8 18 12.5 8 18 8s10 4.5 10 10zm-6.5 0c0-2-1.5-3.5-3.5-3.5S14.5 16 14.5 18s1.5 3.5 3.5 3.5 3.5-1.5 3.5-3.5z" fill="white"/></svg>`,
    },
    {
      id: 'solflare',
      name: 'Solflare',
      desc: 'Connect with your Solflare Wallet',
      detected: !!(window.solflare?.isSolflare),
      icon: `<svg width="36" height="36" viewBox="0 0 36 36"><rect width="36" height="36" rx="10" fill="#FC8800"/><path d="M18 7L27 19L18 27L9 19Z" fill="white" opacity="0.95"/><path d="M18 7L27 19L18 19Z" fill="white" opacity="0.45"/></svg>`,
    },
    {
      id: 'backpack',
      name: 'Backpack',
      desc: 'Connect with your Backpack Wallet',
      detected: !!(window.backpack?.isBackpack),
      icon: `<svg width="36" height="36" viewBox="0 0 36 36"><rect width="36" height="36" rx="10" fill="#E33E3F"/><rect x="11" y="16" width="14" height="12" rx="2" fill="none" stroke="white" stroke-width="2"/><path d="M15 16V13a3 3 0 016 0v3" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"/><circle cx="18" cy="22" r="2" fill="white"/></svg>`,
    },
  ];

  return WALLETS.map(w => `
    <div class="wallet-opt" onclick="connectWallet('${w.id}')">
      <div class="w-icon">${w.icon}</div>
      <div style="flex:1">
        <div class="w-name">${w.name}</div>
        <div class="w-desc">${w.desc}</div>
      </div>
      ${w.detected ? '<span class="w-detected">Detected</span>' : '<svg class="w-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>'}
    </div>`).join('');
}

function updateWalletUI() {
  const btn = document.getElementById('btnWallet');
  const chip = document.getElementById('addrChip');
  const addrTxt = document.getElementById('addrText');
  const swAddr = document.getElementById('swAddr');
  const sw = document.getElementById('sidebarWallet');
  const scb = document.getElementById('sidebarConnectBtn');

  if (!btn) return;

  if (_ws.connected) {
    btn.className = 'btn-wallet connected';
    btn.innerHTML = `<span class="w-dot"></span>${fmtAddr(_ws.address)}`;
    btn.onclick = disconnectWallet;
    if (chip) { chip.style.display = 'flex'; if (addrTxt) addrTxt.textContent = fmtAddr(_ws.address); }
    if (sw) sw.style.display = 'block';
    if (scb) scb.style.display = 'none';
    if (swAddr) swAddr.textContent = _ws.address;
  } else {
    btn.className = 'btn-wallet';
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8L2 7h20l-6-4z"/></svg> Connect Wallet`;
    btn.onclick = openWalletModal;
    if (chip) chip.style.display = 'none';
    if (sw) sw.style.display = 'none';
    if (scb) scb.style.display = 'flex';
  }
}

function cleanUrlParameters() {
  const cleanUrl = window.location.origin + window.location.pathname;
  window.history.replaceState({}, document.title, cleanUrl);
}

function fmtAddr(a) { return a ? a.slice(0, 4) + '...' + a.slice(-4) : ''; }

function handleError(err) {
  if (err.code === 4001 || err.message?.includes('rejected')) {
    showToast('info', 'Cancelled', 'Connection cancelled');
  } else {
    showToast('error', 'Failed', err.message || 'Please try again');
  }
}

function showToast(type, title, msg, dur = 4500) {
  let c = document.getElementById('toastContainer') || document.createElement('div');
  if (!c.id) { c.id = 'toastContainer'; c.className = 'toast-container'; document.body.appendChild(c); }
  const icons = { success: '✓', error: '✕', info: 'i', warning: '!' };
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = `<span class="toast-icon">${icons[type]||'i'}</span><div class="toast-body"><div class="toast-title">${title}</div><div class="toast-msg">${msg}</div></div>`;
  c.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 350); }, dur);
}

// ── Global Pipeline Context Wiring ─────────────────────────────
window.openWalletModal = openWalletModal;
window.closeWalletModal = closeWalletModal;
window.connectWallet = connectWallet;
window.disconnectWallet = disconnectWallet;
window.solanaConnection = connection;
window.getActiveWalletState = () => _ws;
window.getActiveProvider = () => getProvider(_ws.name?.toLowerCase());

window.addEventListener('load', () => {
  restoreWallet();
});
