// ══════════════════════════════════════════════════════════════
//  AgricFi MVP — Wallet Manager v3
//  Uses WalletConnect Web3Modal for true mobile wallet support
//  Project ID: 08e21950d57cea4c0ffe80abe503c12a
//
//  Flow on ANY browser (mobile or desktop):
//  Connect Wallet → modal → select wallet → biometric/password
//  → approve → connected ✅
// ══════════════════════════════════════════════════════════════

const WALLETCONNECT_PROJECT_ID = '08e21950d57cea4c0ffe80abe503c12a';
const STORAGE_KEY = 'agricfi_wallet_v1';
const SOLANA_CHAIN = 'solana:devnet';

// ── State ──────────────────────────────────────────────────────
let _ws = { connected: false, address: null, name: null, provider: null };
let _wcClient = null;
let _wcSession = null;

// ── Environment ────────────────────────────────────────────────
const IS_MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

// ── Native wallet providers (desktop extensions + in-app browsers)
function getNativeProvider(id) {
  switch(id) {
    case 'phantom':
      return window.phantom?.solana?.isPhantom
        ? window.phantom.solana
        : (window.solana?.isPhantom ? window.solana : null);
    case 'solflare':
      return window.solflare?.isSolflare ? window.solflare : null;
    case 'backpack':
      return window.backpack?.isBackpack
        ? window.backpack
        : (window.xnft?.solana || null);
    default:
      return null;
  }
}

// ── Wallet definitions ─────────────────────────────────────────
const WALLETS = [
  {
    id: 'phantom',
    name: 'Phantom',
    desc: 'Solana\'s most popular wallet',
    icon: `<svg width="36" height="36" viewBox="0 0 36 36">
      <rect width="36" height="36" rx="10" fill="#ab9ff2"/>
      <path d="M28.5 17.8c0 5.4-4.4 9.8-9.8 9.8s-9.8-4.4-9.8-9.8S13.3 8 18.7 8s9.8 4.4 9.8 9.8zm-6.5-.3c0-2.5-2-4.5-4.5-4.5s-4.5 2-4.5 4.5 2 4.5 4.5 4.5 4.5-2 4.5-4.5z" fill="white"/>
    </svg>`,
  },
  {
    id: 'solflare',
    name: 'Solflare',
    desc: 'Secure multi-asset Solana wallet',
    icon: `<svg width="36" height="36" viewBox="0 0 36 36">
      <rect width="36" height="36" rx="10" fill="#FC8800"/>
      <path d="M18 7L27 19L18 27L9 19Z" fill="white" opacity="0.95"/>
      <path d="M18 7L27 19L18 19Z" fill="white" opacity="0.45"/>
    </svg>`,
  },
  {
    id: 'backpack',
    name: 'Backpack',
    desc: 'Multi-chain wallet by Coral',
    icon: `<svg width="36" height="36" viewBox="0 0 36 36">
      <rect width="36" height="36" rx="10" fill="#E33E3F"/>
      <rect x="11" y="16" width="14" height="12" rx="2" fill="none" stroke="white" stroke-width="2"/>
      <path d="M15 16V13a3 3 0 016 0v3" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"/>
      <circle cx="18" cy="22" r="2" fill="white"/>
    </svg>`,
  },
  {
    id: 'walletconnect',
    name: 'WalletConnect',
    desc: 'Connect any Solana wallet via QR',
    icon: `<svg width="36" height="36" viewBox="0 0 36 36">
      <rect width="36" height="36" rx="10" fill="#3B99FC"/>
      <path d="M11.5 15.2c3.6-3.5 9.4-3.5 13 0l.4.4c.2.2.2.5 0 .7l-1.5 1.4c-.1.1-.3.1-.4 0l-.6-.6c-2.5-2.4-6.5-2.4-9 0l-.6.6c-.1.1-.3.1-.4 0l-1.5-1.4c-.2-.2-.2-.5 0-.7l.6-.4zm16.1 3l1.3 1.3c.2.2.2.5 0 .7l-5.9 5.7c-.2.2-.5.2-.7 0l-4.2-4c-.1-.1-.2-.1-.3 0l-4.2 4c-.2.2-.5.2-.7 0L7 20.2c-.2-.2-.2-.5 0-.7l1.3-1.3c.2-.2.5-.2.7 0l4.2 4.1c.1.1.2.1.3 0l4.2-4.1c.2-.2.5-.2.7 0l4.2 4.1c.1.1.2.1.3 0l4.2-4.1c.2-.1.5-.1.7.1z" fill="white"/>
    </svg>`,
  },
];

// ══════════════════════════════════════════════════════════════
//  CONNECT NATIVE WALLET (Desktop extension / in-app browser)
// ══════════════════════════════════════════════════════════════
async function connectNative(walletId) {
  const provider = getNativeProvider(walletId);
  if (!provider) return false;

  try {
    await provider.connect();
    const address = provider.publicKey?.toString();
    if (!address) throw new Error('Could not read wallet address');

    const def = WALLETS.find(w => w.id === walletId);
    _ws = { connected: true, address, name: def?.name || walletId, provider, walletId };
    saveSession({ type: 'native', walletId, address, name: def?.name || walletId });
    updateWalletUI();
    watchNative(provider);
    showToast('success', 'Wallet Connected', (def?.name || walletId) + ': ' + fmtAddr(address));
    closeWalletModal();
    if (typeof onWalletConnected === 'function') onWalletConnected(_ws);
    return true;
  } catch (err) {
    if (err.code === 4001 || err.message?.includes('rejected') || err.message?.includes('User rejected')) {
      showToast('info', 'Cancelled', 'Connection was cancelled.');
    } else {
      showToast('error', 'Connection Failed', err.message || 'Please try again.');
    }
    return false;
  }
}

// ── Watch native wallet for disconnect / account change
function watchNative(provider) {
  provider.on?.('disconnect', () => {
    _ws = { connected: false, address: null, name: null, provider: null };
    localStorage.removeItem(STORAGE_KEY);
    updateWalletUI();
    showToast('info', 'Disconnected', 'Wallet disconnected.');
    if (typeof onWalletDisconnected === 'function') onWalletDisconnected();
  });
  provider.on?.('accountChanged', (pk) => {
    if (pk) {
      _ws.address = pk.toString();
      saveSession({ type: 'native', walletId: _ws.walletId, address: _ws.address, name: _ws.name });
      updateWalletUI();
    } else {
      disconnectWallet();
    }
  });
}

// ══════════════════════════════════════════════════════════════
//  WALLETCONNECT (Mobile browsers — gives biometric experience)
// ══════════════════════════════════════════════════════════════
async function connectViaWalletConnect() {
  showToast('info', 'Loading WalletConnect...', 'Please wait a moment.');

  try {
    // Dynamically load WalletConnect SignClient from CDN
    const { SignClient } = await import('https://esm.sh/@walletconnect/sign-client@2.13.0');

    _wcClient = await SignClient.init({
      projectId: WALLETCONNECT_PROJECT_ID,
      metadata: {
        name: 'AgricFi',
        description: 'Tokenizing verified farmland on Solana',
        url: 'https://agricfi.github.io/AgricFi-MVP/',
        icons: ['https://agricfi.github.io/AgricFi-MVP/assets/logo.png'],
      },
    });

    // Create WalletConnect session
    const { uri, approval } = await _wcClient.connect({
      requiredNamespaces: {
        solana: {
          methods: ['solana_signTransaction', 'solana_signMessage'],
          chains: [SOLANA_CHAIN],
          events: ['accountsChanged'],
        },
      },
    });

    if (uri) {
      // Show QR code modal for desktop, deeplink for mobile
      if (IS_MOBILE) {
        showWCMobileModal(uri);
      } else {
        showWCQRModal(uri);
      }
    }

    // Wait for user to approve in wallet app
    const session = await approval();
    _wcSession = session;

    // Extract address from session
    const accounts = session.namespaces?.solana?.accounts || [];
    if (!accounts.length) throw new Error('No Solana account in session');

    // Format: "solana:devnet:ADDRESS"
    const address = accounts[0].split(':')[2];
    if (!address) throw new Error('Could not parse wallet address');

    _ws = { connected: true, address, name: 'WalletConnect', provider: null, walletId: 'walletconnect' };
    saveSession({ type: 'walletconnect', address, name: 'WalletConnect', topic: session.topic });
    updateWalletUI();
    closeWalletModal();
    closeWCModal();
    showToast('success', 'Wallet Connected', 'WalletConnect: ' + fmtAddr(address));
    if (typeof onWalletConnected === 'function') onWalletConnected(_ws);

    // Watch WC session events
    _wcClient.on('session_delete', () => {
      _ws = { connected: false, address: null, name: null, provider: null };
      localStorage.removeItem(STORAGE_KEY);
      updateWalletUI();
      showToast('info', 'Disconnected', 'WalletConnect session ended.');
      if (typeof onWalletDisconnected === 'function') onWalletDisconnected();
    });

  } catch (err) {
    closeWCModal();
    if (err.message?.includes('cancelled') || err.message?.includes('rejected') || err.message?.includes('Proposal')) {
      showToast('info', 'Cancelled', 'Connection was cancelled.');
    } else {
      console.error('[AgricFi WC]', err);
      showToast('error', 'WalletConnect Failed', err.message || 'Please try again.');
    }
  }
}

// ── Show QR code for desktop WalletConnect
function showWCQRModal(uri) {
  closeWCModal();
  const modal = document.createElement('div');
  modal.id = 'wcModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);backdrop-filter:blur(8px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:1rem';
  modal.innerHTML = `
    <div style="background:#060f08;border:1px solid rgba(0,255,135,.2);border-radius:20px;padding:2rem;max-width:360px;width:100%;text-align:center">
      <h3 style="font-family:'Cabinet Grotesk',sans-serif;font-weight:800;font-size:1.1rem;margin-bottom:.5rem">Scan with Wallet App</h3>
      <p style="font-size:.8rem;color:#4a8a5c;margin-bottom:1.5rem">Open Phantom, Solflare or any Solana wallet and scan this QR code</p>
      <div id="wcQR" style="background:white;border-radius:12px;padding:1rem;display:inline-block;margin-bottom:1.25rem"></div>
      <p style="font-size:.7rem;color:#4a8a5c;margin-bottom:1rem;word-break:break-all;font-family:monospace">${uri.slice(0,40)}...</p>
      <button onclick="closeWCModal()" style="padding:.6rem 1.5rem;border-radius:8px;border:1px solid rgba(0,255,135,.2);background:transparent;color:#00ff87;font-family:'Cabinet Grotesk',sans-serif;font-weight:700;cursor:pointer;font-size:.82rem">Cancel</button>
    </div>`;
  document.body.appendChild(modal);

  // Load QR code library and render
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js';
  script.onload = () => {
    if (window.QRCode) {
      QRCode.toCanvas
        ? QRCode.toDataURL(uri, { width: 220, margin: 1 }, (err, url) => {
            if (!err) {
              const img = document.createElement('img');
              img.src = url; img.style.cssText = 'width:220px;height:220px;display:block';
              const qrDiv = document.getElementById('wcQR');
              if (qrDiv) { qrDiv.innerHTML = ''; qrDiv.appendChild(img); }
            }
          })
        : null;
    }
  };
  document.head.appendChild(script);
}

// ── Show mobile deeplink options for WalletConnect
function showWCMobileModal(uri) {
  closeWCModal();
  const encoded = encodeURIComponent(uri);
  const walletLinks = [
    { name: 'Phantom',  url: `https://phantom.app/ul/wc?uri=${encoded}`,  color: '#ab9ff2' },
    { name: 'Solflare', url: `https://solflare.com/ul/wc?uri=${encoded}`, color: '#FC8800' },
    { name: 'Backpack', url: `https://backpack.app/wc?uri=${encoded}`,    color: '#E33E3F' },
  ];

  const modal = document.createElement('div');
  modal.id = 'wcModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);backdrop-filter:blur(8px);z-index:1000;display:flex;align-items:flex-end;justify-content:center;padding:1rem';
  modal.innerHTML = `
    <div style="background:#060f08;border:1px solid rgba(0,255,135,.2);border-radius:20px 20px 16px 16px;padding:1.75rem;width:100%;max-width:480px">
      <h3 style="font-family:'Cabinet Grotesk',sans-serif;font-weight:800;font-size:1.05rem;margin-bottom:.4rem;text-align:center">Open in Wallet App</h3>
      <p style="font-size:.78rem;color:#4a8a5c;margin-bottom:1.5rem;text-align:center">Choose your wallet to connect with biometric authentication</p>
      ${walletLinks.map(w => `
        <a href="${w.url}" style="display:flex;align-items:center;gap:12px;padding:.9rem 1.1rem;border:1px solid rgba(255,255,255,.08);border-radius:12px;margin-bottom:.6rem;text-decoration:none;color:#e8fef0;transition:border-color .2s" onclick="setTimeout(closeWCModal,1000)">
          <div style="width:38px;height:38px;border-radius:9px;background:${w.color};display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><circle cx="12" cy="12" r="10"/></svg>
          </div>
          <div>
            <div style="font-family:'Cabinet Grotesk',sans-serif;font-weight:800;font-size:.9rem">${w.name}</div>
            <div style="font-size:.7rem;color:#4a8a5c">Tap to open ${w.name} app</div>
          </div>
          <svg style="margin-left:auto;color:#4a8a5c" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </a>`).join('')}
      <button onclick="closeWCModal()" style="width:100%;padding:.7rem;border-radius:10px;border:1px solid rgba(0,255,135,.15);background:transparent;color:#4a8a5c;font-family:'Cabinet Grotesk',sans-serif;font-weight:700;cursor:pointer;font-size:.82rem;margin-top:.25rem">Cancel</button>
    </div>`;
  document.body.appendChild(modal);
}

function closeWCModal() {
  document.getElementById('wcModal')?.remove();
}

// ══════════════════════════════════════════════════════════════
//  MAIN CONNECT ENTRY POINT
// ══════════════════════════════════════════════════════════════
async function connectWallet(walletId) {
  closeWalletModal();

  if (walletId === 'walletconnect') {
    await connectViaWalletConnect();
    return;
  }

  // Try native provider first (desktop extension or in-app browser)
  const provider = getNativeProvider(walletId);

  if (provider) {
    // Native provider available — connect directly
    await connectNative(walletId);
    return;
  }

  // No native provider — mobile browser scenario
  // Route through WalletConnect which handles biometric unlock
  showToast('info', 'Connecting via WalletConnect...', 'Opening wallet connection...');
  await connectViaWalletConnect();
}

// ══════════════════════════════════════════════════════════════
//  DISCONNECT
// ══════════════════════════════════════════════════════════════
async function disconnectWallet() {
  try {
    if (_ws.provider?.disconnect) await _ws.provider.disconnect();
    if (_wcClient && _wcSession?.topic) {
      await _wcClient.disconnect({
        topic: _wcSession.topic,
        reason: { code: 6000, message: 'User disconnected' },
      }).catch(() => {});
    }
  } catch (e) {}

  _ws = { connected: false, address: null, name: null, provider: null };
  _wcSession = null;
  localStorage.removeItem(STORAGE_KEY);
  updateWalletUI();
  showToast('info', 'Disconnected', 'Wallet disconnected successfully.');
  if (typeof onWalletDisconnected === 'function') onWalletDisconnected();
}

// ══════════════════════════════════════════════════════════════
//  RESTORE SESSION on page load
// ══════════════════════════════════════════════════════════════
async function restoreWallet() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;

  try {
    const session = JSON.parse(saved);

    if (session.type === 'native') {
      const provider = getNativeProvider(session.walletId);
      if (!provider) return;

      // Already connected (in-app browser persists)
      if (provider.isConnected && provider.publicKey) {
        _ws = { connected: true, address: provider.publicKey.toString(), name: session.name, provider, walletId: session.walletId };
        updateWalletUI();
        watchNative(provider);
        if (typeof onWalletConnected === 'function') onWalletConnected(_ws);
        return;
      }

      // Silent reconnect
      try {
        await provider.connect({ onlyIfTrusted: true });
        if (provider.publicKey) {
          _ws = { connected: true, address: provider.publicKey.toString(), name: session.name, provider, walletId: session.walletId };
          updateWalletUI();
          watchNative(provider);
          if (typeof onWalletConnected === 'function') onWalletConnected(_ws);
        }
      } catch (e) {
        localStorage.removeItem(STORAGE_KEY);
      }

    } else if (session.type === 'walletconnect' && session.address) {
      // Restore WC session display only (full re-auth on next interaction)
      _ws = { connected: true, address: session.address, name: 'WalletConnect', provider: null };
      updateWalletUI();
      if (typeof onWalletConnected === 'function') onWalletConnected(_ws);
    }

  } catch (e) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

// ── Save session ───────────────────────────────────────────────
function saveSession(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, ts: Date.now() }));
}

// ══════════════════════════════════════════════════════════════
//  UI HELPERS
// ══════════════════════════════════════════════════════════════
function fmtAddr(a) {
  if (!a) return '';
  return a.slice(0, 4) + '...' + a.slice(-4);
}

async function copyAddr() {
  if (!_ws.address) return;
  try {
    await navigator.clipboard.writeText(_ws.address);
    showToast('success', 'Copied!', 'Wallet address copied to clipboard.');
  } catch (e) {
    showToast('error', 'Failed', 'Could not copy address.');
  }
}
function copyWalletAddress() { return copyAddr(); }

function updateWalletUI() {
  const btn     = document.getElementById('btnWallet');
  const chip    = document.getElementById('addrChip');
  const addrTxt = document.getElementById('addrText');
  const swAddr  = document.getElementById('swAddr');
  const sw      = document.getElementById('sidebarWallet');
  const scb     = document.getElementById('sidebarConnectBtn');

  if (!btn) return;

  if (_ws.connected) {
    btn.className = 'btn-wallet connected';
    btn.innerHTML = '<span class="w-dot"></span>' + fmtAddr(_ws.address);
    btn.onclick   = disconnectWallet;
    btn.title     = 'Click to disconnect';
    if (chip)   { chip.style.display = 'flex'; if (addrTxt) addrTxt.textContent = fmtAddr(_ws.address); }
    if (sw)     sw.style.display  = 'block';
    if (scb)    scb.style.display = 'none';
    if (swAddr) swAddr.textContent = _ws.address;
    const wf = document.getElementById('f_wallet');
    if (wf) wf.value = _ws.address;
  } else {
    btn.className = 'btn-wallet';
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="2" y="7" width="20" height="14" rx="2"/>
      <path d="M16 3H8L2 7h20l-6-4z"/>
    </svg> Connect Wallet`;
    btn.onclick = openWalletModal;
    if (chip)  chip.style.display = 'none';
    if (sw)    sw.style.display   = 'none';
    if (scb)   scb.style.display  = 'flex';
  }
}

// ── Build wallet modal options ─────────────────────────────────
function buildWalletOpts() {
  return WALLETS.map(w => {
    const hasNative = w.id !== 'walletconnect' && !!getNativeProvider(w.id);
    const badge = hasNative
      ? '<span class="w-detected">Detected</span>'
      : w.id === 'walletconnect'
        ? `<span style="font-size:.6rem;font-weight:700;color:#3B99FC;background:rgba(59,153,252,.1);border:1px solid rgba(59,153,252,.2);padding:2px 7px;border-radius:4px;text-transform:uppercase;letter-spacing:.06em;margin-left:auto;white-space:nowrap">QR / Mobile</span>`
        : `<svg class="w-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
    return `
      <div class="wallet-opt" onclick="connectWallet('${w.id}')">
        <div class="w-icon">${w.icon}</div>
        <div style="flex:1">
          <div class="w-name">${w.name}</div>
          <div class="w-desc">${w.desc}</div>
        </div>
        ${badge}
      </div>`;
  }).join('');
}

function openWalletModal() {
  const opts = document.getElementById('walletOpts');
  if (opts) opts.innerHTML = buildWalletOpts();
  const modal = document.getElementById('walletModal');
  if (modal) modal.classList.add('open');
}
function closeWalletModal() {
  document.getElementById('walletModal')?.classList.remove('open');
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
  el.innerHTML = `
    <span class="toast-icon">${icons[type] || 'i'}</span>
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
function initParticles(canvasId) {
  const canvas = document.getElementById(canvasId || 'particles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize);
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
          ctx.strokeStyle = `rgba(0,255,135,${0.04 * (1 - d / 85)})`; ctx.lineWidth = 0.5; ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  })();
}

// ── Scroll reveal ──────────────────────────────────────────────
function initReveal() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

// ── Animated counters ──────────────────────────────────────────
function initCounters() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const el = e.target;
        const target = parseFloat(el.dataset.count);
        const prefix = el.dataset.prefix || '';
        const suffix = el.dataset.suffix || '';
        const dur = 1800, start = performance.now(), big = target > 999;
        (function up(now) {
          const p = Math.min((now - start) / dur, 1), ease = 1 - Math.pow(1 - p, 3), cur = target * ease;
          el.textContent = prefix + (big ? Math.floor(cur).toLocaleString() : parseFloat(cur.toFixed(1))) + suffix;
          if (p < 1) requestAnimationFrame(up);
        })(start);
        obs.unobserve(el);
      }
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('[data-count]').forEach(el => obs.observe(el));
}

// ── w-dot animation ────────────────────────────────────────────
(function() {
  const s = document.createElement('style');
  s.textContent = `
    .w-dot{width:7px;height:7px;border-radius:50%;background:#00ff87;
      animation:wDotAnim 2s infinite;flex-shrink:0;display:inline-block}
    @keyframes wDotAnim{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.65)}}
  `;
  document.head.appendChild(s);
})();

// ── Page init ──────────────────────────────────────────────────
window.addEventListener('load', () => {
  initParticles('particles');
  initReveal();
  initCounters();
  restoreWallet();
});

// ══════════════════════════════════════════════════════════════
//  EXPOSE GLOBALS — needed for onclick= attributes in HTML
// ══════════════════════════════════════════════════════════════
window.connectWallet      = connectWallet;
window.disconnectWallet   = disconnectWallet;
window.openWalletModal    = openWalletModal;
window.closeWalletModal   = closeWalletModal;
window.closeWCModal       = closeWCModal;
window.copyAddr           = copyAddr;
window.copyWalletAddress  = copyWalletAddress;
window.fmtAddr            = fmtAddr;
window.showToast          = showToast;
window.updateWalletUI     = updateWalletUI;
window.restoreWallet      = restoreWallet;
window.initParticles      = initParticles;
window.initReveal         = initReveal;
window.initCounters       = initCounters;
