// ── AgricFi MVP — Wallet Manager ──
// Supports Phantom, Solflare, and all Solana-compatible wallets

const WalletManager = (function() {

  const STORAGE_KEY = 'agricfi_wallet';
  let _state = { connected: false, address: null, provider: null, name: null };

  // ── Detect installed wallets
  function detectWallets() {
    const wallets = [];
    
    // PC Extensions
    if (window.solana?.isPhantom)   wallets.push({ id: 'phantom', name: 'Phantom', provider: window.solana });
    if (window.solflare?.isSolflare) wallets.push({ id: 'solflare', name: 'Solflare', provider: window.solflare });
    if (window.backpack)             wallets.push({ id: 'backpack', name: 'Backpack', provider: window.backpack });

    // MOBILE FIX: If no extensions found and user is on a mobile device
    if (wallets.length === 0 && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
      wallets.push({ 
        id: 'phantom-mobile', 
        name: 'Open in Phantom App', 
        provider: null 
      });
    }
    return wallets;
  }

  // ── Connect to a specific wallet provider
  async function connect(walletId) {
    // 1. MOBILE REDIRECT (Fixes the loop by encoding the URL correctly)
    if (walletId === 'phantom-mobile') {
      const cleanUrl = window.location.href.split('#')[0]; 
      const encodedUrl = encodeURIComponent(cleanUrl);
      window.location.href = `https://phantom.app/ul/browse/${encodedUrl}?ref=${encodedUrl}`;
      return { success: false, error: 'Redirecting to Phantom App...' };
    }

    const all = detectWallets();
    const wallet = all.find(w => w.id === walletId);

    // 2. PC PROTECTION (Stop the download loop and fix connection)
    if (!wallet || !wallet.provider) {
      // ONLY open download page if NOT on mobile
      if (!/Android|iPhone|iPad/i.test(navigator.userAgent)) {
          const installUrls = { 
            phantom: 'https://phantom.app/', 
            solflare: 'https://solflare.com/',
            backpack: 'https://backpack.app/'
          };
          if (installUrls[walletId]) window.open(installUrls[walletId], '_blank');
      }
      return { success: false, error: 'Wallet extension not detected.' };
    }

    try {
      const resp = await wallet.provider.connect();
      const address = resp.publicKey.toString();
      _state = { connected: true, address, provider: wallet.provider, name: wallet.name };
      persist();
      return { success: true, address, name: wallet.name };
    } catch (err) {
      return { success: false, error: err.message || 'Connection rejected' };
    }
  }

  // ── Disconnect
  async function disconnect() {
    try {
      if (_state.provider?.disconnect) await _state.provider.disconnect();
    } catch(e) {}
    _state = { connected: false, address: null, provider: null, name: null };
    localStorage.removeItem(STORAGE_KEY);
  }

  // ── Restore session from localStorage
  async function restore() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return false;
    try {
      const { address, name, walletId } = JSON.parse(saved);
      const all = detectWallets();
      const wallet = all.find(w => w.id === walletId);
      if (!wallet) return false;

      if (wallet.provider.isConnected && wallet.provider.publicKey) {
        _state = { connected: true, address: wallet.provider.publicKey.toString(), provider: wallet.provider, name };
        return true;
      }
      try {
        const resp = await wallet.provider.connect({ onlyIfTrusted: true });
        _state = { connected: true, address: resp.publicKey.toString(), provider: wallet.provider, name };
        return true;
      } catch(e) { return false; }
    } catch(e) { return false; }
  }

  // ── Persist wallet session
  function persist() {
    if (!_state.connected) return;
    const id = Object.keys({phantom:'',solflare:'',backpack:''}).find(k => {
      const p = {phantom:window.solana,solflare:window.solflare,backpack:window.backpack}[k];
      return p === _state.provider;
    }) || 'unknown';
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ address: _state.address, name: _state.name, walletId: id }));
  }

  // ── Public getters
  function getState()   { return { ..._state }; }
  function isConnected(){ return _state.connected; }
  function getAddress() { return _state.address; }
  function getName()    { return _state.name; }
  function formatAddress(addr) {
    const a = addr || _state.address;
    if (!a) return '';
    return a.slice(0,4) + '...' + a.slice(-4);
  }

  // ── Copy address to clipboard
  async function copyAddress() {
    if (!_state.address) return false;
    try {
      await navigator.clipboard.writeText(_state.address);
      return true;
    } catch(e) { return false; }
  }

  // ── Listen for wallet account changes
  function watchChanges(onDisconnect) {
    if (_state.provider) {
      _state.provider.on?.('disconnect', () => {
        disconnect();
        if (onDisconnect) onDisconnect();
      });
      _state.provider.on?.('accountChanged', (pk) => {
        if (pk) _state.address = pk.toString();
        else { disconnect(); if (onDisconnect) onDisconnect(); }
      });
    }
  }

  return { detectWallets, connect, disconnect, restore, getState, isConnected, getAddress, getName, formatAddress, copyAddress, watchChanges };
})();

// ── UI Helpers ──

function buildWalletModal() {
  const installed = WalletManager.detectWallets().map(w => w.id);
  const ALL_WALLETS = [
    { id: 'phantom',  name: 'Phantom',  desc: 'Most popular Solana wallet',    iconUrl: 'https://i.ibb.co/k4DmBjD/phantom.png' },
    { id: 'solflare', name: 'Solflare', desc: 'Secure Solana wallet',           iconUrl: 'https://i.ibb.co/6r9wBHJ/solflare.png' },
    { id: 'backpack', name: 'Backpack', desc: 'Multi-chain wallet by Coral',    iconUrl: 'https://i.ibb.co/RgNwqcW/backpack.png' },
  ];

  return ALL_WALLETS.map(w => {
    const isInstalled = installed.includes(w.id);
    return `
    <div class="wallet-option" onclick="handleWalletConnect('${w.id}')">
      <div class="wallet-icon">
        <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
          ${w.id === 'phantom'  ? '<circle cx="16" cy="16" r="16" fill="#ab9ff2"/><path d="M27 16.5c0 6.075-4.925 11-11 11S5 22.575 5 16.5 9.925 5.5 16 5.5s11 4.925 11 11zm-5.5-.5c0-3.038-2.462-5.5-5.5-5.5S10.5 12.962 10.5 16s2.462 5.5 5.5 5.5 5.5-2.462 5.5-5.5z" fill="white"/>' : ''}
          ${w.id === 'solflare' ? '<circle cx="16" cy="16" r="16" fill="#FC8800"/><path d="M16 6l8 10-8 10-8-10z" fill="white" opacity=".9"/>' : ''}
          ${w.id === 'backpack' ? '<rect width="32" height="32" rx="8" fill="#E33E3F"/><path d="M10 12h12v12H10z M13 12V9a3 3 0 016 0v3" stroke="white" stroke-width="2" fill="none" stroke-linecap="round"/>' : ''}
        </svg>
      </div>
      <div>
        <div class="wallet-name">${w.name}</div>
        <div class="wallet-desc">${w.desc}</div>
      </div>
      ${isInstalled
        ? '<span class="wallet-detected">Detected</span>'
        : '<svg class="wallet-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>'}
    </div>`;
  }).join('');
}

function updateWalletUI() {
  const state = WalletManager.getState();
  const btnWallet  = document.getElementById('btnWallet');
  const addrChip   = document.getElementById('addrChip');

  if (!btnWallet) return;

  if (state.connected) {
    btnWallet.className = 'btn-wallet connected';
    btnWallet.innerHTML = `<span class="wallet-dot"></span>${WalletManager.formatAddress()}`;
    btnWallet.onclick = () => handleDisconnect();
    if (addrChip) {
      addrChip.style.display = 'flex';
      const txt = addrChip.querySelector('.addr-text') || addrChip.querySelector('span');
      if (txt) txt.textContent = WalletManager.formatAddress();
    }
  } else {
    btnWallet.className = 'btn-wallet';
    btnWallet.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8L2 7h20l-6-4z"/></svg> Connect Wallet`;
    btnWallet.onclick = () => openWalletModal();
    if (addrChip) addrChip.style.display = 'none';
  }
}

function openWalletModal() {
  const modal = document.getElementById('walletModal');
  if (!modal) return;
  const body = document.getElementById('walletOptions');
  if (body) body.innerHTML = buildWalletModal();
  modal.classList.add('open');
}

function closeWalletModal() {
  const modal = document.getElementById('walletModal');
  if (modal) modal.classList.remove('open');
}

async function handleWalletConnect(walletId) {
  // Mobile Redirect Logic
  if (walletId === 'phantom-mobile') {
    closeWalletModal();
    const cleanUrl = window.location.href.replace(/^https?:\/\//, '');
    window.location.href = `https://phantom.app/ul/browse/${cleanUrl}`;
    return;
  }

  closeWalletModal();
  showToast('info', 'Connecting...', `Opening ${walletId} wallet`);
  const result = await WalletManager.connect(walletId);
  if (result.success) {
    showToast('success', 'Wallet Connected', `${result.name}: ${WalletManager.formatAddress(result.address)}`);
    updateWalletUI();
    WalletManager.watchChanges(() => { updateWalletUI(); });
    
    // Trigger dashboard updates if functions exist
    if (typeof onConnected === 'function') onConnected();
    if (typeof onWalletConnected === 'function') onWalletConnected(result);
  } else {
    showToast('error', 'Connection Failed', result.error || 'Please try again');
  }
}

async function handleDisconnect() {
  await WalletManager.disconnect();
  updateWalletUI();
  showToast('info', 'Disconnected', 'Wallet disconnected successfully');
  if (typeof onWalletDisconnected === 'function') onWalletDisconnected();
}

async function copyWalletAddress() {
  const ok = await WalletManager.copyAddress();
  if (ok) showToast('success', 'Copied!', 'Wallet address copied to clipboard');
}

function showToast(type, title, msg, duration = 4000) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✓', error: '✕', info: 'i', warning: '!' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]||'i'}</span>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      <div class="toast-msg">${msg}</div>
    </div>`;
  container.appendChild(toast);
  requestAnimationFrame(() => { requestAnimationFrame(() => toast.classList.add('show')); });
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 350);
  }, duration);
}

function initParticles(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  resize(); window.addEventListener('resize', resize);
  const pts = Array.from({length: 80}, () => ({
    x: Math.random() * canvas.width, y: Math.random() * canvas.height,
    r: Math.random() * 1.2 + 0.3,
    vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2,
    a: Math.random() * 0.35 + 0.05,
    c: Math.random() > 0.75 ? '#f0c040' : '#00ff87'
  }));
  (function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pts.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fillStyle = p.c; ctx.globalAlpha = p.a; ctx.fill();
    });
    ctx.globalAlpha = 1;
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
      if (e.isIntersecting) {
        const el = e.target;
        const target = parseFloat(el.dataset.count);
        if (!isNaN(target)) {
            const start = performance.now();
            (function up(now) {
                const p = Math.min((now-start)/1800, 1);
                const cur = target * (1 - Math.pow(1-p, 3));
                el.textContent = (el.dataset.prefix||'') + (target > 999 ? Math.floor(cur).toLocaleString() : parseFloat(cur.toFixed(1))) + (el.dataset.suffix||'');
                if (p < 1) requestAnimationFrame(up);
            })(start);
        }
        obs.unobserve(el);
      }
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('[data-count]').forEach(el => obs.observe(el));
}

// Init on page load
async function initWallet() {
  const restored = await WalletManager.restore();
  if (restored) {
    updateWalletUI();
    WalletManager.watchChanges(() => updateWalletUI());
  }
  initParticles('particles');
  initReveal();
  initCounters();
}
