// ══════════════════════════════════════════════════════════════
//  AgricFi MVP — Wallet Manager v5.1 (Fixed)
//  Reown AppKit + Native fallback + Mobile deeplinks
//  FIX: Disable in-app wallet browser detection — always show native modal
//  NEW: Transaction signing & approval support added
//  Project ID: 08e21950d57cea4c0ffe80abe503c12a
// ══════════════════════════════════════════════════════════════

const WC_PROJECT_ID = '08e21950d57cea4c0ffe80abe503c12a';
const STORAGE_KEY   = 'agricfi_wallet_v1';
const APP_URL       = 'https://agricfi.github.io/AgricFi-MVP/';
const IS_MOBILE     = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

// ── Wallet in-app browser detection
const IN_PHANTOM_BROWSER  = !!(window.phantom?.solana?.isPhantom || window.solana?.isPhantom);
const IN_SOLFLARE_BROWSER = !!(window.solflare?.isSolflare);
const IN_BACKPACK_BROWSER = !!(window.backpack?.isBackpack);
const IN_WALLET_BROWSER   = IN_PHANTOM_BROWSER || IN_SOLFLARE_BROWSER || IN_BACKPACK_BROWSER;

// ── Shared state
window._ws = window._ws || { connected: false, address: null, name: null };

let _modal       = null;
let _initPromise = null;

function getWS() {
  return window._ws || { connected: false, address: null, name: null };
}

// ══════════════════════════════════════════════════════════════
//  INIT REOWN APPKIT
// ══════════════════════════════════════════════════════════════
async function initAppKit() {
  if (_modal) return _modal;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    try {
      const [appkitMod, adapterMod, networksMod] = await Promise.all([
        import('https://esm.sh/@reown/appkit@1.6.8'),
        import('https://esm.sh/@reown/appkit-adapter-solana@1.6.8'),
        import('https://esm.sh/@reown/appkit/networks'),
      ]);

      const { createAppKit }   = appkitMod;
      const { SolanaAdapter }  = adapterMod;
      const { solanaDevnet }   = networksMod;

      const adapter = new SolanaAdapter({ wallets: [] });

      _modal = createAppKit({
        adapters:       [adapter],
        networks:       [solanaDevnet],
        defaultNetwork: solanaDevnet,
        projectId:      WC_PROJECT_ID,
        metadata: {
          name:        'AgricFi',
          description: 'Tokenizing verified farmland. Earn real yield.',
          url:          APP_URL,
          icons:        [APP_URL + 'assets/logo.png'],
        },
        features: {
          analytics: false,
          email:     false,
          socials:   false,
          onramp:    false,
        },
        themeMode: 'dark',
        themeVariables: {
          '--w3m-color-mix':          '#00ff87',
          '--w3m-color-mix-strength':  20,
          '--w3m-accent':             '#00ff87',
          '--w3m-background-color':   '#020804',
          '--w3m-border-radius-master':'4px',
          '--w3m-z-index':            '9999',
        },
      });

      _modal.subscribeAccount(account => {
        if (account?.address) {
          window._ws = {
            connected: true,
            address:   account.address,
            name:      account.connector || 'Wallet',
          };
          saveSession();
          updateWalletUI();
          if (typeof onWalletConnected === 'function') onWalletConnected(window._ws);
        } else if (window._ws.connected) {
          window._ws = { connected: false, address: null, name: null };
          localStorage.removeItem(STORAGE_KEY);
          updateWalletUI();
          if (typeof onWalletDisconnected === 'function') onWalletDisconnected();
        }
      });

      return _modal;

    } catch (err) {
      console.warn('[AgricFi] AppKit load failed, using native fallback:', err.message);
      return null;
    }
  })();

  return _initPromise;
}

// ══════════════════════════════════════════════════════════════
//  OPEN WALLET MODAL
// ══════════════════════════════════════════════════════════════
async function openWalletModal() {
  showToast('info', 'Loading wallets...', 'Please wait a moment');

  const modal = await initAppKit();

  if (modal) {
    try {
      modal.open({ view: 'Connect' });
    } catch (e) {
      _showNativeModal();
    }
  } else {
    _showNativeModal();
  }
}

function closeWalletModal() {
  _modal?.close?.();
  document.getElementById('walletModal')?.classList.remove('open');
}

// ══════════════════════════════════════════════════════════════
//  NATIVE FALLBACK MODAL
// ══════════════════════════════════════════════════════════════
function _showNativeModal() {
  const opts = document.getElementById('walletOpts');
  if (opts) opts.innerHTML = _buildNativeOpts();
  const modal = document.getElementById('walletModal');
  if (modal) modal.classList.add('open');
}

function _buildNativeOpts() {
  const WALLETS = [
    {
      id: 'phantom',
      name: 'Phantom',
      desc: IS_MOBILE ? 'Open in Phantom app' : 'Phantom browser extension',
      detected: !!(window.phantom?.solana?.isPhantom || window.solana?.isPhantom),
      icon: `<svg width="36" height="36" viewBox="0 0 36 36"><rect width="36" height="36" rx="10" fill="#ab9ff2"/><path d="M28 18c0 5.5-4.5 10-10 10S8 23.5 8 18 12.5 8 18 8s10 4.5 10 10zm-6.5 0c0-2-1.5-3.5-3.5-3.5S14.5 16 14.5 18s1.5 3.5 3.5 3.5 3.5-1.5 3.5-3.5z" fill="white"/></svg>`,
    },
    {
      id: 'solflare',
      name: 'Solflare',
      desc: IS_MOBILE ? 'Open in Solflare app' : 'Solflare browser extension',
      detected: !!(window.solflare?.isSolflare),
      icon: `<svg width="36" height="36" viewBox="0 0 36 36"><rect width="36" height="36" rx="10" fill="#FC8800"/><path d="M18 7L27 19L18 27L9 19Z" fill="white" opacity="0.95"/><path d="M18 7L27 19L18 19Z" fill="white" opacity="0.45"/></svg>`,
    },
    {
      id: 'backpack',
      name: 'Backpack',
      desc: IS_MOBILE ? 'Open in Backpack app' : 'Backpack browser extension',
      detected: !!(window.backpack?.isBackpack),
      icon: `<svg width="36" height="36" viewBox="0 0 36 36"><rect width="36" height="36" rx="10" fill="#E33E3F"/><rect x="11" y="16" width="14" height="12" rx="2" fill="none" stroke="white" stroke-width="2"/><path d="M15 16V13a3 3 0 016 0v3" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"/><circle cx="18" cy="22" r="2" fill="white"/></svg>`,
    },
  ];

  return WALLETS.map(w => `
    <div class="wallet-opt" onclick="connectNative('${w.id}')">
      <div class="w-icon">${w.icon}</div>
      <div style="flex:1;min-width:0">
        <div class="w-name">${w.name}</div>
        <div class="w-desc">${w.desc}</div>
      </div>
      ${w.detected
        ? '<span class="w-detected">Detected</span>'
        : IS_MOBILE
          ? '<span class="w-mobile-badge">Open App</span>'
          : '<svg class="w-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>'
      }
    </div>`).join('');
}

// ── Connect native wallet
async function connectNative(id) {
  document.getElementById('walletModal')?.classList.remove('open');

  const providers = {
    phantom:  window.phantom?.solana?.isPhantom
                ? window.phantom.solana
                : (window.solana?.isPhantom ? window.solana : null),
    solflare: window.solflare?.isSolflare ? window.solflare : null,
    backpack: window.backpack?.isBackpack  ? window.backpack  : null,
  };
  const names = { phantom: 'Phantom', solflare: 'Solflare', backpack: 'Backpack' };
  const provider = providers[id];

  if (!provider && IS_MOBILE) {
    const deeplinks = {
      phantom:  `https://phantom.app/ul/browse/${encodeURIComponent(APP_URL)}?ref=${encodeURIComponent(APP_URL)}`,
      solflare: `https://solflare.com/ul/v1/browse/${encodeURIComponent(APP_URL)}?ref=${encodeURIComponent(APP_URL)}`,
      backpack: `https://backpack.app/browse/${encodeURIComponent(APP_URL)}`,
    };
    showToast('info', 'Opening ' + names[id] + '...', 'Tap Approve when the app opens');
    setTimeout(() => { window.location.href = deeplinks[id]; }, 500);
    return;
  }

  if (!provider) {
    const installs = {
      phantom:  'https://phantom.app',
      solflare: 'https://solflare.com',
      backpack: 'https://backpack.app',
    };
    showToast('info', names[id] + ' not found', 'Installing...');
    window.open(installs[id], '_blank');
    return;
  }

  showToast('info', 'Connecting ' + names[id] + '...', 'Approve in your wallet');
  try {
    await provider.connect();
    const address = provider.publicKey?.toString();
    if (!address) throw new Error('Could not read address after connecting');
    window._ws = { connected: true, address, name: names[id] };
    saveSession();
    updateWalletUI();
    showToast('success', 'Connected!', names[id] + ': ' + fmtAddr(address));
    if (typeof onWalletConnected === 'function') onWalletConnected(window._ws);
    provider.on?.('disconnect', () => {
      window._ws = { connected: false, address: null, name: null };
      localStorage.removeItem(STORAGE_KEY);
      updateWalletUI();
      if (typeof onWalletDisconnected === 'function') onWalletDisconnected();
    });
    provider.on?.('accountChanged', pk => {
      if (pk) { window._ws.address = pk.toString(); saveSession(); updateWalletUI(); }
      else disconnectWallet();
    });
  } catch (err) {
    if (err.code === 4001 || err.message?.includes('rejected') || err.message?.includes('User rejected')) {
      showToast('info', 'Cancelled', 'Connection was cancelled');
    } else {
      showToast('error', 'Failed', err.message || 'Please try again');
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  DISCONNECT
// ══════════════════════════════════════════════════════════════
async function disconnectWallet() {
  try { if (_modal) await _modal.disconnect?.(); } catch (e) {}
  window._ws = { connected: false, address: null, name: null };
  localStorage.removeItem(STORAGE_KEY);
  updateWalletUI();
  showToast('info', 'Disconnected', 'Wallet disconnected');
  if (typeof onWalletDisconnected === 'function') onWalletDisconnected();
}

// ══════════════════════════════════════════════════════════════
//  SESSION PERSISTENCE
// ══════════════════════════════════════════════════════════════
function saveSession() {
  if (!window._ws?.connected) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    address: window._ws.address,
    name:    window._ws.name,
    ts:      Date.now(),
  }));
}

async function restoreWallet() {
  const modal = await initAppKit().catch(() => null);
  if (modal) {
    const addr = modal.getAddress?.();
    if (addr) {
      window._ws = { connected: true, address: addr, name: 'Wallet' };
      updateWalletUI();
      if (typeof onWalletConnected === 'function') onWalletConnected(window._ws);
      return;
    }
  }

  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;

  try {
    const { address, name } = JSON.parse(saved);
    const providerMap = {
      'Phantom':  window.phantom?.solana?.isPhantom
                    ? window.phantom.solana
                    : (window.solana?.isPhantom ? window.solana : null),
      'Solflare': window.solflare?.isSolflare ? window.solflare : null,
      'Backpack': window.backpack?.isBackpack  ? window.backpack  : null,
    };
    const provider = providerMap[name];

    if (provider) {
      if (provider.isConnected && provider.publicKey) {
        window._ws = { connected: true, address: provider.publicKey.toString(), name };
        updateWalletUI();
        if (typeof onWalletConnected === 'function') onWalletConnected(window._ws);
        return;
      }
      try {
        await provider.connect({ onlyIfTrusted: true });
        if (provider.publicKey) {
          window._ws = { connected: true, address: provider.publicKey.toString(), name };
          updateWalletUI();
          if (typeof onWalletConnected === 'function') onWalletConnected(window._ws);
          return;
        }
      } catch (e) { }
    }

    if (address) {
      window._ws = { connected: true, address, name: name || 'Wallet' };
      updateWalletUI();
      if (typeof onWalletConnected === 'function') onWalletConnected(window._ws);
    }
  } catch (e) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

// ══════════════════════════════════════════════════════════════
//  TRANSACTION SIGNING & APPROVAL
// ══════════════════════════════════════════════════════════════

async function approveTransaction(transactionData) {
  if (!window._ws?.connected) {
    showToast('error', 'Not Connected', 'Please connect your wallet first');
    return null;
  }

  const provider = getProvider(window._ws.name);
  if (!provider) {
    showToast('error', 'Provider Not Found', `${window._ws.name} wallet not available`);
    return null;
  }

  try {
    showToast('info', 'Waiting for Approval', `Please approve in ${window._ws.name}`);
    const signedTransaction = await provider.signTransaction(transactionData);
    showToast('success', 'Transaction Approved!', 'Your signature is ready');
    return signedTransaction;
  } catch (err) {
    if (err.code === 4001 || err.message?.includes('rejected') || err.message?.includes('User rejected')) {
      showToast('info', 'Transaction Cancelled', 'You rejected the transaction');
    } else {
      console.error('[Transaction Error]', err);
      showToast('error', 'Transaction Failed', err.message || 'Something went wrong');
    }
    return null;
  }
}

function getProvider(walletName) {
  if (!walletName) return null;
  
  const name = typeof walletName === 'string' ? walletName.toLowerCase() : '';
  
  if (name.includes('phantom')) {
    return window.phantom?.solana?.isPhantom ? window.phantom.solana : (window.solana?.isPhantom ? window.solana : null);
  }
  if (name.includes('solflare')) {
    return window.solflare?.isSolflare ? window.solflare : null;
  }
  if (name.includes('backpack')) {
    return window.backpack?.isBackpack ? window.backpack : null;
  }
  
  return null;
}

// ══════════════════════════════════════════════════════════════
//  UI HELPERS
// ══════════════════════════════════════════════════════════════
function fmtAddr(a) {
  if (!a) return '';
  return a.slice(0, 4) + '...' + a.slice(-4);
}

async function copyAddr() {
  const addr = getWS().address;
  if (!addr) return;
  try {
    await navigator.clipboard.writeText(addr);
    showToast('success', 'Copied!', 'Wallet address copied to clipboard');
  } catch (e) {
    showToast('error', 'Failed', 'Could not copy address');
  }
}
function copyWalletAddress() { return copyAddr(); }

function updateWalletUI() {
  const ws      = getWS();
  const btn     = document.getElementById('btnWallet');
  const chip    = document.getElementById('addrChip');
  const addrTxt = document.getElementById('addrText');
  const swAddr  = document.getElementById('swAddr');
  const sw      = document.getElementById('sidebarWallet');
  const scb     = document.getElementById('sidebarConnectBtn');

  if (!btn) return;

  if (ws.connected && ws.address) {
    btn.className = 'btn-wallet connected';
    btn.innerHTML = `<span class="w-dot"></span>${fmtAddr(ws.address)}`;
    btn.onclick   = disconnectWallet;
    btn.title     = 'Click to disconnect';
    if (chip)   { chip.style.display = ''; if (addrTxt) addrTxt.textContent = fmtAddr(ws.address); }
    if (sw)     sw.style.display  = 'block';
    if (scb)    scb.style.display = 'none';
    if (swAddr) swAddr.textContent = ws.address;
    const wf = document.getElementById('f_wallet');
    if (wf) wf.value = ws.address;
  } else {
    btn.className = 'btn-wallet';
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8L2 7h20l-6-4z"/></svg> Connect Wallet`;
    btn.onclick   = openWalletModal;
    if (chip)  chip.style.display = 'none';
    if (sw)    sw.style.display   = 'none';
    if (scb)   scb.style.display  = 'flex';
  }
}

// ══════════════════════════════════════════════════════════════
//  TOAST NOTIFICATIONS
// ══════════════════════════════════════════════════════════════
function showToast(type, title, msg, dur = 4500) {
  let c = document.getElementById('toastContainer');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toastContainer';
    c.className = 'toast-container';
    document.body.appendChild(c);
  }
  const icons = { success: '✓', error: '✕', info: 'i', warning: '!' };
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = `<span class="toast-icon">${icons[type] || 'i'}</span><div class="toast-body"><div class="toast-title">${title}</div><div class="toast-msg">${msg}</div></div>`;
  c.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 350); }, dur);
}

// ══════════════════════════════════════════════════════════════
//  PARTICLES BACKGROUND
// ══════════════════════════════════════════════════════════════
function initParticles(canvasId) {
  const canvas = document.getElementById(canvasId || 'particles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize);
  const pts = Array.from({ length: 70 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: Math.random() * 1.1 + 0.3,
    vx: (Math.random() - 0.5) * 0.18,
    vy: (Math.random() - 0.5) * 0.18,
    a: Math.random() * 0.28 + 0.05,
    c: Math.random() > 0.75 ? '#f0c040' : '#00ff87',
  }));
  (function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pts.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = canvas.width;  if (p.x > canvas.width)  p.x = 0;
      if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.c; ctx.globalAlpha = p.a; ctx.fill();
    });
    ctx.globalAlpha = 1;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 85) {
          ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y);
          ctx.strokeStyle = `rgba(0,255,135,${0.04 * (1 - d / 85)})`;
          ctx.lineWidth = 0.5; ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  })();
}

function initReveal() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

function initCounters() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target;
      const target = parseFloat(el.dataset.count);
      const prefix = el.dataset.prefix || '';
      const suffix = el.dataset.suffix || '';
      const dur = 1800, start = performance.now(), big = target > 999;
      (function up(now) {
        const p = Math.min((now - start) / dur, 1);
        const ease = 1 - Math.pow(1 - p, 3);
        const cur  = target * ease;
        el.textContent = prefix + (big ? Math.floor(cur).toLocaleString() : parseFloat(cur.toFixed(1))) + suffix;
        if (p < 1) requestAnimationFrame(up);
      })(start);
      obs.unobserve(el);
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('[data-count]').forEach(el => obs.observe(el));
}

// ══════════════════════════════════════════════════════════════
//  INJECT BASE STYLES
// ══════════════════════════════════════════════════════════════
(function injectStyles() {
  if (document.getElementById('_wStyles')) return;
  const s = document.createElement('style');
  s.id = '_wStyles';
  s.textContent = `
    .w-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: #00ff87; display: inline-block; flex-shrink: 0;
      animation: _wDot 2s infinite;
    }
    @keyframes _wDot {
      0%,100%{ opacity:1; transform:scale(1); }
      50%    { opacity:.4; transform:scale(.65); }
    }
    .w-detected {
      font-size: .58rem; font-weight: 700; color: #00ff87;
      background: rgba(0,255,135,.1); border: 1px solid rgba(0,255,135,.2);
      border-radius: 4px; padding: 2px 7px; text-transform: uppercase;
      letter-spacing: .06em; margin-left: auto; white-space: nowrap;
    }
    .w-mobile-badge {
      font-size: .58rem; font-weight: 700; color: #000;
      background: #f0c040; border-radius: 4px; padding: 2px 7px;
      text-transform: uppercase; letter-spacing: .06em;
      margin-left: auto; white-space: nowrap;
    }
    .w-arrow { margin-left: auto; color: #4a8a5c; flex-shrink: 0; }
    w3m-modal, appkit-modal, wcm-modal {
      z-index: 9999 !important;
    }
  `;
  document.head.appendChild(s);
})();

// ══════════════════════════════════════════════════════════════
//  GLOBAL EXPORTS
// ══════════════════════════════════════════════════════════════
window.openWalletModal    = openWalletModal;
window.closeWalletModal   = closeWalletModal;
window.connectNative      = connectNative;
window.connectWallet      = connectNative;
window.disconnectWallet   = disconnectWallet;
window.copyAddr           = copyAddr;
window.copyWalletAddress  = copyWalletAddress;
window.fmtAddr            = fmtAddr;
window.getWS              = getWS;
window.showToast          = showToast;
window.updateWalletUI     = updateWalletUI;
window.restoreWallet      = restoreWallet;
window.initParticles      = initParticles;
window.initReveal         = initReveal;
window.initCounters       = initCounters;
window.approveTransaction = approveTransaction;
window.getProvider        = getProvider;

// ══════════════════════════════════════════════════════════════
//  PAGE INIT
// ══════════════════════════════════════════════════════════════
window.addEventListener('load', () => {
  injectStyles?.();
  initParticles('particles');
  initReveal();
  initCounters();
  initAppKit().catch(() => {});
  restoreWallet();
});
