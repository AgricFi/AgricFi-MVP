// ══════════════════════════════════════════════════════════════
//  AgricFi MVP — Wallet Manager v4
//  Powered by Reown AppKit (WalletConnect)
//  Project ID: 08e21950d57cea4c0ffe80abe503c12a
//
//  Works on:
//  ✅ Desktop Chrome/Firefox/Safari (extension wallets)
//  ✅ Mobile Chrome/Safari (deeplink → biometric → connected)
//  ✅ Phantom, Solflare, Backpack, Trust, any WC wallet
// ══════════════════════════════════════════════════════════════

const WC_PROJECT_ID  = '08e21950d57cea4c0ffe80abe503c12a';
const STORAGE_KEY    = 'agricfi_wallet_v1';
const APP_URL        = 'https://agricfi.github.io/AgricFi-MVP/';
const APP_ICON       = 'https://agricfi.github.io/AgricFi-MVP/assets/logo.png';
const IS_MOBILE      = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

// ── Internal state ─────────────────────────────────────────────
let _modal   = null;   // Reown AppKit modal instance
let _ws      = { connected: false, address: null, name: null };
let _initDone = false;
let _initPromise = null;

// ── Initialise Reown AppKit (lazy, once) ───────────────────────
async function initAppKit() {
  if (_initDone) return _modal;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    try {
      const [
        { createAppKit },
        { SolanaAdapter },
        { solanaDevnet, solana }
      ] = await Promise.all([
        import('https://esm.sh/@reown/appkit@1.6.8'),
        import('https://esm.sh/@reown/appkit-adapter-solana@1.6.8'),
        import('https://esm.sh/@reown/appkit/networks'),
      ]);

      const solanaAdapter = new SolanaAdapter({
        wallets: [] // auto-detects all installed Solana wallets
      });

      _modal = createAppKit({
        adapters: [solanaAdapter],
        networks: [solanaDevnet, solana],
        defaultNetwork: solanaDevnet,
        projectId: WC_PROJECT_ID,
        metadata: {
          name:        'AgricFi',
          description: 'Tokenizing verified farmland. Earn real yield.',
          url:          APP_URL,
          icons:       [APP_ICON],
        },
        features: {
          analytics:    false,
          email:        false,
          socials:      false,
          onramp:       false,
        },
        themeMode: 'dark',
        themeVariables: {
          '--w3m-color-mix':             '#00ff87',
          '--w3m-color-mix-strength':     20,
          '--w3m-accent':                '#00ff87',
          '--w3m-background-color':      '#020804',
          '--w3m-border-radius-master':  '4px',
        },
      });

      // ── Subscribe to state changes ──────────────────────────
      _modal.subscribeState(state => {
        if (!state.open) {
          // Modal closed — check if wallet connected
          syncFromModal();
        }
      });

      // Also subscribe to account changes
      _modal.subscribeAccount(account => {
        if (account?.address) {
          _ws = { connected: true, address: account.address, name: account.connector || 'Wallet' };
          saveSession();
          updateWalletUI();
          if (typeof onWalletConnected === 'function') onWalletConnected(_ws);
        } else {
          _ws = { connected: false, address: null, name: null };
          localStorage.removeItem(STORAGE_KEY);
          updateWalletUI();
          if (typeof onWalletDisconnected === 'function') onWalletDisconnected();
        }
      });

      _initDone = true;
      return _modal;

    } catch (err) {
      console.error('[AgricFi Wallet] AppKit init failed:', err);
      // Fall back to native-only mode
      _initDone = true;
      return null;
    }
  })();

  return _initPromise;
}

// ── Sync state from AppKit modal ───────────────────────────────
async function syncFromModal() {
  if (!_modal) return;
  try {
    const address   = _modal.getAddress();
    const connector = _modal.getConnectorName?.() || 'Wallet';
    if (address && address !== _ws.address) {
      _ws = { connected: true, address, name: connector };
      saveSession();
      updateWalletUI();
      if (typeof onWalletConnected === 'function') onWalletConnected(_ws);
    }
  } catch (e) {}
}

// ══════════════════════════════════════════════════════════════
//  OPEN WALLET MODAL
//  This is the single entry point — handles everything
// ══════════════════════════════════════════════════════════════
async function openWalletModal() {
  showToast('info', 'Loading wallet...', 'Initialising connection...');

  const modal = await initAppKit();

  if (modal) {
    // Use Reown AppKit modal — handles mobile deeplinks automatically
    try {
      await modal.open({ view: 'Connect' });
    } catch (e) {
      console.error('[AgricFi Wallet] open error:', e);
    }
  } else {
    // AppKit failed to load — fall back to native detection
    openNativeFallbackModal();
  }
}

function closeWalletModal() {
  if (_modal) {
    _modal.close?.();
  }
  document.getElementById('walletModal')?.classList.remove('open');
  document.getElementById('wcModal')?.remove();
}

// ══════════════════════════════════════════════════════════════
//  NATIVE FALLBACK (when CDN is unavailable)
//  For desktop extension wallets without AppKit
// ══════════════════════════════════════════════════════════════
function openNativeFallbackModal() {
  const opts = document.getElementById('walletOpts');
  if (opts) opts.innerHTML = buildNativeOpts();
  const modal = document.getElementById('walletModal');
  if (modal) modal.classList.add('open');
}

function buildNativeOpts() {
  const WALLETS = [
    {
      id: 'phantom',
      name: 'Phantom',
      desc: 'Most popular Solana wallet',
      detected: !!(window.phantom?.solana?.isPhantom || window.solana?.isPhantom),
      icon: `<svg width="36" height="36" viewBox="0 0 36 36"><rect width="36" height="36" rx="10" fill="#ab9ff2"/>
        <path d="M28 18c0 5.5-4.5 10-10 10S8 23.5 8 18 12.5 8 18 8s10 4.5 10 10zm-6.5 0c0-2-1.5-3.5-3.5-3.5S14.5 16 14.5 18s1.5 3.5 3.5 3.5 3.5-1.5 3.5-3.5z" fill="white"/>
      </svg>`,
    },
    {
      id: 'solflare',
      name: 'Solflare',
      desc: 'Secure multi-asset Solana wallet',
      detected: !!(window.solflare?.isSolflare),
      icon: `<svg width="36" height="36" viewBox="0 0 36 36"><rect width="36" height="36" rx="10" fill="#FC8800"/>
        <path d="M18 7L27 19L18 27L9 19Z" fill="white" opacity="0.95"/>
        <path d="M18 7L27 19L18 19Z" fill="white" opacity="0.45"/>
      </svg>`,
    },
    {
      id: 'backpack',
      name: 'Backpack',
      desc: 'Multi-chain wallet by Coral',
      detected: !!(window.backpack?.isBackpack),
      icon: `<svg width="36" height="36" viewBox="0 0 36 36"><rect width="36" height="36" rx="10" fill="#E33E3F"/>
        <rect x="11" y="16" width="14" height="12" rx="2" fill="none" stroke="white" stroke-width="2"/>
        <path d="M15 16V13a3 3 0 016 0v3" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"/>
        <circle cx="18" cy="22" r="2" fill="white"/>
      </svg>`,
    },
  ];

  return WALLETS.map(w => `
    <div class="wallet-opt" onclick="connectNativeWallet('${w.id}')">
      <div class="w-icon">${w.icon}</div>
      <div style="flex:1">
        <div class="w-name">${w.name}</div>
        <div class="w-desc">${IS_MOBILE ? 'Tap to open ' + w.name + ' app' : w.desc}</div>
      </div>
      ${w.detected
        ? '<span class="w-detected">Detected</span>'
        : IS_MOBILE
          ? '<span class="w-mobile-badge">Open App</span>'
          : '<svg class="w-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>'
      }
    </div>`).join('');
}

// ── Native connect (desktop extensions) ───────────────────────
async function connectNativeWallet(id) {
  document.getElementById('walletModal')?.classList.remove('open');

  const providerMap = {
    phantom:  window.phantom?.solana?.isPhantom ? window.phantom.solana : (window.solana?.isPhantom ? window.solana : null),
    solflare: window.solflare?.isSolflare ? window.solflare : null,
    backpack: window.backpack?.isBackpack ? window.backpack : null,
  };

  const provider = providerMap[id];

  // Mobile — no native provider — use deeplink
  if (!provider && IS_MOBILE) {
    const urls = {
      phantom:  `https://phantom.app/ul/browse/${encodeURIComponent(APP_URL)}?ref=${encodeURIComponent(APP_URL)}`,
      solflare: `https://solflare.com/ul/v1/browse/${encodeURIComponent(APP_URL)}?ref=${encodeURIComponent(APP_URL)}`,
      backpack: `https://backpack.app/browse/${encodeURIComponent(APP_URL)}`,
    };
    showToast('info', 'Opening ' + id + '...', 'Redirecting to wallet app');
    setTimeout(() => { window.location.href = urls[id]; }, 500);
    return;
  }

  if (!provider) {
    const install = { phantom: 'https://phantom.app', solflare: 'https://solflare.com', backpack: 'https://backpack.app' };
    showToast('info', 'Not Installed', 'Install ' + id + ' wallet first');
    window.open(install[id], '_blank');
    return;
  }

  showToast('info', 'Connecting...', 'Approve in ' + id);

  try {
    await provider.connect();
    const address = provider.publicKey?.toString();
    if (!address) throw new Error('Could not read address');

    const names = { phantom: 'Phantom', solflare: 'Solflare', backpack: 'Backpack' };
    _ws = { connected: true, address, name: names[id] || id };
    saveSession();
    updateWalletUI();
    showToast('success', 'Connected!', names[id] + ': ' + fmtAddr(address));
    if (typeof onWalletConnected === 'function') onWalletConnected(_ws);

    // Watch for disconnect
    provider.on?.('disconnect', () => {
      _ws = { connected: false, address: null, name: null };
      localStorage.removeItem(STORAGE_KEY);
      updateWalletUI();
      if (typeof onWalletDisconnected === 'function') onWalletDisconnected();
    });

  } catch (err) {
    if (err.code === 4001 || err.message?.includes('rejected') || err.message?.includes('User rejected')) {
      showToast('info', 'Cancelled', 'Connection cancelled');
    } else {
      showToast('error', 'Failed', err.message || 'Please try again');
    }
  }
}

// Also expose as connectWallet for onclick handlers
async function connectWallet(id) {
  return connectNativeWallet(id);
}

// ══════════════════════════════════════════════════════════════
//  DISCONNECT
// ══════════════════════════════════════════════════════════════
async function disconnectWallet() {
  try {
    if (_modal) await _modal.disconnect?.();
  } catch (e) {}
  _ws = { connected: false, address: null, name: null };
  localStorage.removeItem(STORAGE_KEY);
  updateWalletUI();
  showToast('info', 'Disconnected', 'Wallet disconnected');
  if (typeof onWalletDisconnected === 'function') onWalletDisconnected();
}

// ══════════════════════════════════════════════════════════════
//  SESSION PERSISTENCE
// ══════════════════════════════════════════════════════════════
function saveSession() {
  if (!_ws.connected) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    address: _ws.address, name: _ws.name, ts: Date.now()
  }));
}

async function restoreWallet() {
  // First try AppKit restore (handles WalletConnect sessions)
  const modal = await initAppKit();
  if (modal) {
    const address = modal.getAddress?.();
    if (address) {
      _ws = { connected: true, address, name: 'Wallet' };
      updateWalletUI();
      if (typeof onWalletConnected === 'function') onWalletConnected(_ws);
      return;
    }
  }

  // Then try native restore from localStorage
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;

  try {
    const { address, name } = JSON.parse(saved);

    // Try silent reconnect to native wallet
    const providers = {
      Phantom:  window.phantom?.solana || (window.solana?.isPhantom ? window.solana : null),
      Solflare: window.solflare?.isSolflare ? window.solflare : null,
      Backpack: window.backpack?.isBackpack ? window.backpack : null,
    };

    const provider = providers[name];
    if (provider) {
      if (provider.isConnected && provider.publicKey) {
        _ws = { connected: true, address: provider.publicKey.toString(), name };
        updateWalletUI();
        if (typeof onWalletConnected === 'function') onWalletConnected(_ws);
        return;
      }
      try {
        await provider.connect({ onlyIfTrusted: true });
        if (provider.publicKey) {
          _ws = { connected: true, address: provider.publicKey.toString(), name };
          updateWalletUI();
          if (typeof onWalletConnected === 'function') onWalletConnected(_ws);
          return;
        }
      } catch (e) {}
    }

    // Restore display only (address from storage)
    if (address) {
      _ws = { connected: true, address, name: name || 'Wallet' };
      updateWalletUI();
      if (typeof onWalletConnected === 'function') onWalletConnected(_ws);
    }

  } catch (e) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

// ══════════════════════════════════════════════════════════════
//  UI
// ══════════════════════════════════════════════════════════════
function fmtAddr(a) {
  if (!a) return '';
  return a.slice(0, 4) + '...' + a.slice(-4);
}

async function copyAddr() {
  if (!_ws.address) return;
  try {
    await navigator.clipboard.writeText(_ws.address);
    showToast('success', 'Copied!', 'Address copied to clipboard');
  } catch (e) {
    showToast('error', 'Failed', 'Could not copy address');
  }
}
function copyWalletAddress() { return copyAddr(); }

function updateWalletUI() {
  const btn    = document.getElementById('btnWallet');
  const chip   = document.getElementById('addrChip');
  const addrTxt= document.getElementById('addrText');
  const swAddr = document.getElementById('swAddr');
  const sw     = document.getElementById('sidebarWallet');
  const scb    = document.getElementById('sidebarConnectBtn');

  if (!btn) return;

  if (_ws.connected) {
    btn.className   = 'btn-wallet connected';
    btn.innerHTML   = `<span class="w-dot"></span>${fmtAddr(_ws.address)}`;
    btn.onclick     = disconnectWallet;
    btn.title       = 'Click to disconnect';
    if (chip)   { chip.style.display = 'flex'; if (addrTxt) addrTxt.textContent = fmtAddr(_ws.address); }
    if (sw)     sw.style.display  = 'block';
    if (scb)    scb.style.display = 'none';
    if (swAddr) swAddr.textContent = _ws.address;
    const wf = document.getElementById('f_wallet');
    if (wf) wf.value = _ws.address;
  } else {
    btn.className = 'btn-wallet';
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8L2 7h20l-6-4z"/>
    </svg> Connect Wallet`;
    btn.onclick   = openWalletModal;
    if (chip)  chip.style.display = 'none';
    if (sw)    sw.style.display   = 'none';
    if (scb)   scb.style.display  = 'flex';
  }
}

// ══════════════════════════════════════════════════════════════
//  TOAST
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
  el.innerHTML = `<span class="toast-icon">${icons[type]||'i'}</span>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      <div class="toast-msg">${msg}</div>
    </div>`;
  c.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 350); }, dur);
}

// ══════════════════════════════════════════════════════════════
//  PARTICLES
// ══════════════════════════════════════════════════════════════
function initParticles(id) {
  const canvas = document.getElementById(id || 'particles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  resize(); window.addEventListener('resize', resize);
  const pts = Array.from({ length: 70 }, () => ({
    x: Math.random() * canvas.width, y: Math.random() * canvas.height,
    r: Math.random() * 1.1 + 0.3,
    vx: (Math.random() - 0.5) * 0.18, vy: (Math.random() - 0.5) * 0.18,
    a: Math.random() * 0.28 + 0.05,
    c: Math.random() > 0.75 ? '#f0c040' : '#00ff87',
  }));
  (function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pts.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.c; ctx.globalAlpha = p.a; ctx.fill();
    });
    ctx.globalAlpha = 1;
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x-pts[j].x, dy = pts[i].y-pts[j].y, d = Math.sqrt(dx*dx+dy*dy);
        if (d < 85) { ctx.beginPath(); ctx.moveTo(pts[i].x,pts[i].y); ctx.lineTo(pts[j].x,pts[j].y); ctx.strokeStyle=`rgba(0,255,135,${0.04*(1-d/85)})`; ctx.lineWidth=0.5; ctx.stroke(); }
      }
    requestAnimationFrame(draw);
  })();
}

// ── Scroll reveal ──────────────────────────────────────────────
function initReveal() {
  const obs = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) e.target.classList.add('visible');
  }), { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

// ── Animated counters ──────────────────────────────────────────
function initCounters() {
  const obs = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    const el = e.target, target = parseFloat(el.dataset.count),
          prefix = el.dataset.prefix||'', suffix = el.dataset.suffix||'',
          dur = 1800, start = performance.now(), big = target > 999;
    (function up(now) {
      const p = Math.min((now-start)/dur,1), ease = 1-Math.pow(1-p,3), cur = target*ease;
      el.textContent = prefix+(big?Math.floor(cur).toLocaleString():parseFloat(cur.toFixed(1)))+suffix;
      if (p < 1) requestAnimationFrame(up);
    })(start);
    obs.unobserve(el);
  }), { threshold: 0.5 });
  document.querySelectorAll('[data-count]').forEach(el => obs.observe(el));
}

// ══════════════════════════════════════════════════════════════
//  INJECT STYLES for w-dot + mobile badge
// ══════════════════════════════════════════════════════════════
(function injectStyles() {
  if (document.getElementById('wms')) return;
  const s = document.createElement('style');
  s.id = 'wms';
  s.textContent = `
    .w-dot { width:7px;height:7px;border-radius:50%;background:#00ff87;
      animation:wDot 2s infinite;flex-shrink:0;display:inline-block; }
    @keyframes wDot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.65)} }
    .w-mobile-badge { font-size:.58rem;font-weight:700;color:#000;
      background:#f0c040;border-radius:4px;padding:2px 7px;
      text-transform:uppercase;letter-spacing:.06em;margin-left:auto;white-space:nowrap; }
    .w-detected { font-size:.58rem;font-weight:700;color:#00ff87;
      background:rgba(0,255,135,.1);border:1px solid rgba(0,255,135,.2);
      border-radius:4px;padding:2px 7px;text-transform:uppercase;
      letter-spacing:.06em;margin-left:auto;white-space:nowrap; }
    .w-arrow { margin-left:auto;color:#4a8a5c; }
    /* AppKit modal override to match AgricFi theme */
    w3m-modal, appkit-modal {
      --w3m-accent: #00ff87 !important;
      --w3m-background-color: #020804 !important;
    }
  `;
  document.head.appendChild(s);
})();

// ══════════════════════════════════════════════════════════════
//  GLOBAL EXPORTS — required for onclick= in HTML
// ══════════════════════════════════════════════════════════════
window.openWalletModal    = openWalletModal;
window.closeWalletModal   = closeWalletModal;
window.connectWallet      = connectWallet;
window.connectNativeWallet= connectNativeWallet;
window.disconnectWallet   = disconnectWallet;
window.copyAddr           = copyAddr;
window.copyWalletAddress  = copyWalletAddress;
window.fmtAddr            = fmtAddr;
window.showToast          = showToast;
window.updateWalletUI     = updateWalletUI;
window.restoreWallet      = restoreWallet;
window.initParticles      = initParticles;
window.initReveal         = initReveal;
window.initCounters       = initCounters;

// ── Page init ──────────────────────────────────────────────────
window.addEventListener('load', () => {
  initParticles('particles');
  initReveal();
  initCounters();
  // Pre-init AppKit in background so modal opens instantly
  initAppKit().catch(() => {});
  restoreWallet();
});
