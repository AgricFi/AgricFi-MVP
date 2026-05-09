WALLET_JS = '''// ── AgricFi MVP — Wallet Manager ──
// Supports Phantom, Solflare, Backpack and all Solana-compatible wallets

const WALLET_KEY = 'agricfi_wallet_v1';
let _ws = { connected: false, address: null, name: null, provider: null };

// ── DETECT installed wallets
function detectWallets() {
  const w = [];
  if (window.phantom?.solana?.isPhantom)  w.push({ id: 'phantom',  name: 'Phantom',  p: window.phantom.solana });
  else if (window.solana?.isPhantom)      w.push({ id: 'phantom',  name: 'Phantom',  p: window.solana });
  if (window.solflare?.isSolflare)        w.push({ id: 'solflare', name: 'Solflare', p: window.solflare });
  if (window.backpack?.isBackpack)        w.push({ id: 'backpack',  name: 'Backpack', p: window.backpack });
  return w;
}

// ── CONNECT to wallet — robust across all providers
async function connectWallet(walletId) {
  closeWalletModal();
  const all = detectWallets();
  const wallet = all.find(w => w.id === walletId);

  if (!wallet) {
    const urls = { phantom: 'https://phantom.app/', solflare: 'https://solflare.com/', backpack: 'https://backpack.app/' };
    if (urls[walletId]) window.open(urls[walletId], '_blank');
    showToast('info', 'Wallet not installed', 'Install ' + walletId + ' then try again');
    return;
  }

  showToast('info', 'Connecting...', 'Opening ' + wallet.name);

  try {
    // Connect — different providers return differently
    await wallet.p.connect();

    // Always read publicKey from provider after connect (most reliable)
    let address = null;
    if (wallet.p.publicKey) {
      address = wallet.p.publicKey.toString();
    } else if (wallet.p.selectedAddress) {
      address = wallet.p.selectedAddress;
    }

    if (!address) throw new Error('Could not retrieve wallet address');

    _ws = { connected: true, address, name: wallet.name, provider: wallet.p };
    localStorage.setItem(WALLET_KEY, JSON.stringify({ address, name: wallet.name, walletId }));
    updateWalletUI();
    showToast('success', 'Wallet Connected', wallet.name + ': ' + fmtAddr(address));
    watchWallet();
    if (typeof onWalletConnected === 'function') onWalletConnected();

  } catch (e) {
    if (e.code === 4001 || e.message?.includes('rejected') || e.message?.includes('cancelled')) {
      showToast('info', 'Cancelled', 'Wallet connection cancelled');
    } else {
      showToast('error', 'Connection Failed', e.message || 'Please try again');
    }
  }
}

// ── DISCONNECT
async function disconnectWallet() {
  try { if (_ws.provider?.disconnect) await _ws.provider.disconnect(); } catch (e) {}
  _ws = { connected: false, address: null, name: null, provider: null };
  localStorage.removeItem(WALLET_KEY);
  updateWalletUI();
  showToast('info', 'Disconnected', 'Wallet disconnected successfully');
  if (typeof onWalletDisconnected === 'function') onWalletDisconnected();
}

// ── RESTORE session on page load
async function restoreWallet() {
  const saved = localStorage.getItem(WALLET_KEY);
  if (!saved) return;
  try {
    const { address, name, walletId } = JSON.parse(saved);
    const all = detectWallets();
    const wallet = all.find(w => w.id === walletId);
    if (!wallet) return;

    // Try silent reconnect
    try {
      await wallet.p.connect({ onlyIfTrusted: true });
      const addr = wallet.p.publicKey?.toString() || address;
      _ws = { connected: true, address: addr, name, provider: wallet.p };
      updateWalletUI();
      watchWallet();
      if (typeof onWalletConnected === 'function') onWalletConnected();
    } catch (e) {
      // Not trusted / user revoked — clear storage
      localStorage.removeItem(WALLET_KEY);
    }
  } catch (e) {
    localStorage.removeItem(WALLET_KEY);
  }
}

// ── WATCH for provider events
function watchWallet() {
  if (!_ws.provider) return;
  _ws.provider.on?.('disconnect', () => {
    _ws = { connected: false, address: null, name: null, provider: null };
    localStorage.removeItem(WALLET_KEY);
    updateWalletUI();
    showToast('info', 'Disconnected', 'Wallet session ended');
    if (typeof onWalletDisconnected === 'function') onWalletDisconnected();
  });
  _ws.provider.on?.('accountChanged', (pk) => {
    if (pk) { _ws.address = pk.toString(); updateWalletUI(); }
    else disconnectWallet();
  });
}

// ── FORMAT address short
function fmtAddr(a) {
  if (!a) return '';
  return a.slice(0, 4) + '...' + a.slice(-4);
}

// ── COPY address to clipboard
async function copyAddr() {
  if (!_ws.address) return;
  try {
    await navigator.clipboard.writeText(_ws.address);
    showToast('success', 'Copied!', 'Wallet address copied to clipboard');
  } catch (e) {
    showToast('error', 'Failed', 'Could not copy address');
  }
}

// ── UPDATE wallet UI elements on page
function updateWalletUI() {
  const btn    = document.getElementById('btnWallet');
  const chip   = document.getElementById('addrChip');
  const addrTxt= document.getElementById('addrText');
  const swAddr = document.getElementById('swAddr');
  const sw     = document.getElementById('sidebarWallet');
  const scb    = document.getElementById('sidebarConnectBtn');

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
    // Pre-fill KYC wallet field
    const wf = document.getElementById('f_wallet');
    if (wf) wf.value = _ws.address;
  } else {
    btn.className = 'btn-wallet';
    btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8L2 7h20l-6-4z"/></svg> Connect Wallet';
    btn.onclick   = openWalletModal;
    if (chip)  chip.style.display  = 'none';
    if (sw)    sw.style.display    = 'none';
    if (scb)   scb.style.display   = 'flex';
  }
}

// ── BUILD wallet option HTML with real brand logos
function buildWalletOpts() {
  const installed = detectWallets().map(w => w.id);
  const WALLETS = [
    { id: 'phantom',  name: 'Phantom',  desc: 'Most popular Solana wallet' },
    { id: 'solflare', name: 'Solflare', desc: 'Secure multi-asset Solana wallet' },
    { id: 'backpack', name: 'Backpack', desc: 'Multi-chain wallet by Coral' },
  ];
  // Real brand SVG icons (no external URLs needed)
  const ICONS = {
    phantom: `<svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
      <rect width="36" height="36" rx="10" fill="#ab9ff2"/>
      <path d="M29.5 18.5c0 6.351-5.149 11.5-11.5 11.5S6.5 24.851 6.5 18.5 11.649 7 18 7s11.5 5.149 11.5 11.5zm-6.5-.5c0-2.761-2.239-5-5-5s-5 2.239-5 5 2.239 5 5 5 5-2.239 5-5z" fill="white"/>
    </svg>`,
    solflare: `<svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
      <rect width="36" height="36" rx="10" fill="#FC8800"/>
      <path d="M18 8 L27 20 L18 28 L9 20 Z" fill="white" opacity="0.95"/>
      <path d="M18 8 L27 20 L18 20 Z" fill="white" opacity="0.5"/>
    </svg>`,
    backpack: `<svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
      <rect width="36" height="36" rx="10" fill="#E33E3F"/>
      <rect x="10" y="15" width="16" height="14" rx="2" fill="none" stroke="white" stroke-width="2"/>
      <path d="M14 15V12a4 4 0 018 0v3" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"/>
      <circle cx="18" cy="22" r="2" fill="white"/>
    </svg>`,
  };

  return WALLETS.map(w => `
    <div class="wallet-opt" onclick="connectWallet('${w.id}')">
      <div class="w-icon">${ICONS[w.id]}</div>
      <div>
        <div class="w-name">${w.name}</div>
        <div class="w-desc">${w.desc}</div>
      </div>
      ${installed.includes(w.id)
        ? '<span class="w-detected">Detected</span>'
        : '<svg class="w-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>'
      }
    </div>`).join('');
}

// ── OPEN / CLOSE wallet modal
function openWalletModal() {
  const opts = document.getElementById('walletOpts');
  if (opts) opts.innerHTML = buildWalletOpts();
  const modal = document.getElementById('walletModal');
  if (modal) modal.classList.add('open');
}

function closeWalletModal() {
  const modal = document.getElementById('walletModal');
  if (modal) modal.classList.remove('open');
}

// ── TOAST notifications
function showToast(type, title, msg, dur = 4500) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✓', error: '✕', info: 'i', warning: '!' };
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = `<span class="toast-icon">${icons[type] || 'i'}</span>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      <div class="toast-msg">${msg}</div>
    </div>`;
  container.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 350); }, dur);
}

// ── PARTICLES background
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
    vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2,
    a: Math.random() * 0.3 + 0.05,
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

// ── SCROLL reveal
function initReveal() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

// ── ANIMATED counters
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

// ── INIT on page load
window.addEventListener('load', () => {
  initParticles();
  initReveal();
  initCounters();
  restoreWallet();
});
'''

with open('wallet.js', 'w') as f:
    f.write(WALLET_JS)

print(f"wallet.js written: {len(WALLET_JS)} chars")
