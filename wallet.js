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
    // --- MOBILE REDIRECT ADDITION ---
    if (walletId === 'phantom-mobile') {
      const cleanUrl = window.location.href.split('#')[0]; 
    const encodedUrl = encodeURIComponent(cleanUrl);
    window.location.href = `https://phantom.app/ul/browse/${encodedUrl}?ref=${encodedUrl}`;
      
    // --- END MOBILE REDIRECT ---

    const all = detectWallets();
    const wallet = all.find(w => w.id === walletId);

    // If wallet not installed, open install page
    if (!/Android|iPhone|iPad/i.test(navigator.userAgent)) {
          const installUrls = { phantom: 'https://phantom.app/', solflare: 'https://solflare.com/' };
          if (installUrls[walletId]) window.open(installUrls[walletId], '_blank');
      }
      return { success: false, error: 'Wallet not detected. Please unlock your extension.' };
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

      // Silently reconnect (no user prompt if already approved)
      if (wallet.provider.isConnected && wallet.provider.publicKey) {
        _state = { connected: true, address: wallet.provider.publicKey.toString(), provider: wallet.provider, name };
        return true;
      }
      // Try eager connect (Phantom/Solflare support this)
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

// Build wallet connect modal HTML
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

// Update all wallet UI elements on the page
function updateWalletUI() {
  const state = WalletManager.getState();
  const btnWallet  = document.getElementById('btnWallet');
  const addrChip   = document.getElementById('addrChip');
  const navSwitch  = document.getElementById('navSwitch');

  if (!btnWallet) return;

  if (state.connected) {
    btnWallet.className = 'btn-wallet connected';
    btnWallet.innerHTML = `<span class="wallet-dot"></span>${WalletManager.formatAddress()}`;
    btnWallet.onclick = () => handleDisconnect();
    btnWallet.title = 'Click to disconnect';
    if (addrChip) {
      addrChip.style.display = 'flex';
      addrChip.querySelector('.addr-text').textContent = WalletManager.formatAddress();
    }
  } else {
    btnWallet.className = 'btn-wallet';
    btnWallet.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8L2 7h20l-6-4z"/></svg> Connect Wallet`;
    btnWallet.onclick = () => openWalletModal();
    if (addrChip) addrChip.style.display = 'none';
  }
}

// Open wallet modal
function openWalletModal() {
  const modal = document.getElementById('walletModal');
  if (!modal) return;
  const body = modal.querySelector('#walletOptions');
  if (body) body.innerHTML = buildWalletModal();
  modal.classList.add('open');
}

function closeWalletModal() {
  const modal = document.getElementById('walletModal');
  if (modal) modal.classList.remove('open');
}

// Handle wallet selection
async function handleWalletConnect(walletId) {
  // 1. MOBILE REDIRECT (Keep this for phone users)
  if (walletId === 'phantom-mobile') {
    closeWalletModal();
    const cleanUrl = window.location.href.split('#')[0];
    const encodedUrl = encodeURIComponent(cleanUrl);
    window.location.href = `https://phantom.app/ul/browse/${encodedUrl}?ref=${encodedUrl}`;
    return;
  }

  // 2. PC CONNECTION (Fix for PC Extensions)
  closeWalletModal();
  showToast('info', 'Connecting...', `Opening ${walletId} wallet`);
  
  // Notice we call WalletManager.connect (the internal function)
  const result = await WalletManager.connect(walletId); 
  
  if (result.success) {
    showToast('success', 'Wallet Connected', `${result.name}: ${WalletManager.formatAddress(result.address)}`);
    updateWalletUI();
    WalletManager.watchChanges(() => { updateWalletUI(); });
    
    // This triggers the Dashboard numbers and charts to appear
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

// ── Toast notifications
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

// ── Particles background
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
    for (let i = 0; i < pts.length; i++) {
      for (let j = i+1; j < pts.length; j++) {
        const dx = pts[i].x-pts[j].x, dy = pts[i].y-pts[j].y, d = Math.sqrt(dx*dx+dy*dy);
        if (d < 80) { ctx.beginPath(); ctx.moveTo(pts[i].x,pts[i].y); ctx.lineTo(pts[j].x,pts[j].y); ctx.strokeStyle=`rgba(0,255,135,${0.04*(1-d/80)})`; ctx.lineWidth=0.5; ctx.stroke(); }
      }
    }
    requestAnimationFrame(draw);
  })();
}

// ── Scroll reveal
function initReveal() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

// ── Animated counters
function animateCounter(el, target, prefix='', suffix='', duration=1800) {
  const start = performance.now();
  const big = target > 999;
  (function up(now) {
    const p = Math.min((now-start)/duration, 1), ease = 1 - Math.pow(1-p, 3), cur = target * ease;
    el.textContent = prefix + (big ? Math.floor(cur).toLocaleString() : parseFloat(cur.toFixed(1))) + suffix;
    if (p < 1) requestAnimationFrame(up);
  })(start);
}

function initCounters() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const el = e.target;
        animateCounter(el, parseFloat(el.dataset.count), el.dataset.prefix||'', el.dataset.suffix||'');
        obs.unobserve(el);
      }
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('[data-count]').forEach(el => obs.observe(el));
}

// ── Generate farm certificate SVG
function farmCertSVG(farm) {
  const isGreen = farm.color === 'green';
  const c = isGreen ? '0,255,135' : farm.color === 'gold' ? '240,192,64' : '150,150,255';
  return `<svg viewBox="0 0 400 160" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="bg${farm.id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${isGreen?'#001a08':farm.color==='gold'?'#0d1800':'#0a0a14'}"/>
      <stop offset="100%" stop-color="${isGreen?'#003318':farm.color==='gold'?'#1a2e00':'#141428'}"/>
    </linearGradient></defs>
    <rect width="400" height="160" fill="url(#bg${farm.id})"/>
    <path d="M20,80 Q80,50 140,75 Q200,100 260,65 Q320,30 390,55" fill="none" stroke="rgba(${c},.12)" stroke-width="1"/>
    <path d="M20,95 Q80,65 140,90 Q200,115 260,80 Q320,45 390,70" fill="none" stroke="rgba(${c},.08)" stroke-width="1"/>
    <path d="M20,65 Q80,35 140,60 Q200,85 260,50 Q320,15 390,40" fill="none" stroke="rgba(${c},.07)" stroke-width="1"/>
    <line x1="0" y1="40" x2="400" y2="40" stroke="rgba(${c},.03)" stroke-width=".5"/>
    <line x1="0" y1="80" x2="400" y2="80" stroke="rgba(${c},.03)" stroke-width=".5"/>
    <line x1="0" y1="120" x2="400" y2="120" stroke="rgba(${c},.03)" stroke-width=".5"/>
    <line x1="100" y1="0" x2="100" y2="160" stroke="rgba(${c},.03)" stroke-width=".5"/>
    <line x1="200" y1="0" x2="200" y2="160" stroke="rgba(${c},.03)" stroke-width=".5"/>
    <line x1="300" y1="0" x2="300" y2="160" stroke="rgba(${c},.03)" stroke-width=".5"/>
    <polygon points="70,30 190,20 320,45 340,115 215,135 80,130 55,85" fill="rgba(${c},.05)" stroke="rgba(${c},.35)" stroke-width="1.5" stroke-dasharray="6,3"/>
    <circle cx="195" cy="78" r="4" fill="rgb(${c})" opacity=".9"/>
    <circle cx="195" cy="78" r="9"  fill="none" stroke="rgba(${c},.45)" stroke-width="1"/>
    <circle cx="195" cy="78" r="16" fill="none" stroke="rgba(${c},.2)"  stroke-width="1"/>
    <text x="200" y="150" text-anchor="middle" fill="rgba(${c},.08)" font-family="'Courier New',monospace" font-size="8" letter-spacing="3">${farm.serial}</text>
  </svg>`;
}

// ── Build farm card HTML
function buildFarmCard(farm, showInvestBtn = true) {
  const fundedPct = farm.target > 0 ? pct(farm.raised, farm.target) : 0;
  const statusMap = { live: 'live', filling: 'filling', soon: 'soon' };
  const statusLabel = { live: 'Live', filling: 'Filling', soon: 'Coming Soon' };
  const valClass = farm.color === 'green' ? 'g' : farm.color === 'gold' ? 'a' : '';
  const canInvest = farm.status !== 'soon' && WalletManager.isConnected();

  return `
  <div class="farm-card reveal">
    <div class="farm-cert-header">
      ${farmCertSVG(farm)}
      <div class="farm-cert-overlay"></div>
      <div class="farm-cert-badges">
        <span class="farm-nft-id">NFT ${farm.nftId}</span>
        <span class="farm-status-badge ${statusMap[farm.status]}">
          ${farm.status !== 'soon' ? '<span class="status-dot"></span>' : ''}
          ${statusLabel[farm.status]}
        </span>
      </div>
      <div class="farm-cert-bottom">
        <span class="farm-coords">${farm.coords}</span>
        <span class="farm-ha-badge">${farm.size} Ha</span>
      </div>
    </div>
    <div class="farm-card-body">
      <div class="farm-name">${farm.name} — ${farm.location}</div>
      <div class="farm-data-grid">
        <div class="farm-data-cell"><div class="farm-data-val ${valClass}">${farm.roi.min}–${farm.roi.max}%</div><div class="farm-data-lbl">Est. ROI</div></div>
        <div class="farm-data-cell"><div class="farm-data-val ${valClass}">$${farm.target.toLocaleString()}</div><div class="farm-data-lbl">Target</div></div>
        <div class="farm-data-cell"><div class="farm-data-val">${farm.cycle}</div><div class="farm-data-lbl">Harvest</div></div>
        <div class="farm-data-cell"><div class="farm-data-val ${farm.iot ? 'g' : ''}">${farm.iot ? 'Active' : 'Pending'}</div><div class="farm-data-lbl">IoT</div></div>
      </div>
      ${farm.target > 0 ? `
      <div class="farm-progress"><div class="farm-progress-fill" style="width:${fundedPct}%"></div></div>
      <div class="farm-progress-meta">
        <span class="pct">${fundedPct}% Funded</span>
        <span>$${farm.raised.toLocaleString()} / $${farm.target.toLocaleString()}</span>
      </div>` : `
      <div class="farm-progress"><div class="farm-progress-fill" style="width:0%"></div></div>
      <div class="farm-progress-meta"><span style="color:var(--muted)">Whitelist Opening</span><span>—</span></div>`}
      ${showInvestBtn ? `
      <div class="farm-divider"></div>
      <button class="farm-invest-btn" onclick="openInvestModal('${farm.id}')" ${!canInvest ? 'disabled' : ''}>
        ${farm.status === 'soon' ? 'Join Whitelist' : canInvest ? 'Invest with SOL' : 'Connect Wallet to Invest'}
      </button>
      <div class="farm-chain"><div class="sol-dot"></div>Verified on Solana Devnet</div>` : ''}
    </div>
  </div>`;
}

// ── Wallet modal HTML (reusable)
function walletModalHTML() {
  return `
  <div class="modal-overlay" id="walletModal">
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">Connect Wallet</span>
        <button class="modal-close" onclick="closeWalletModal()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <p style="font-size:.85rem;color:var(--muted);margin-bottom:1.25rem;font-weight:300">Choose your Solana-compatible wallet to access the AgricFi platform. Your session will remain active until you disconnect.</p>
        <div id="walletOptions"></div>
        <p style="font-size:.7rem;color:var(--muted);margin-top:1.25rem;text-align:center;line-height:1.55">By connecting, you confirm you are using Solana Devnet for testing purposes only.</p>
      </div>
    </div>
  </div>`;
}

// ── Invest modal
let _investFarm = null;
function openInvestModal(farmId) {
  if (!WalletManager.isConnected()) { openWalletModal(); return; }
  _investFarm = getFarm(farmId);
  if (!_investFarm) return;
  const modal = document.getElementById('investModal');
  if (!modal) return;
  modal.querySelector('#investFarmName').textContent = _investFarm.name + ' — ' + _investFarm.location;
  modal.querySelector('#investApy').textContent = _investFarm.roi.min + '–' + _investFarm.roi.max + '%';
  modal.querySelector('#investCycle').textContent = _investFarm.cycle;
  modal.querySelector('#investAmount').value = '';
  updateInvestSummary();
  modal.classList.add('open');
}

function closeInvestModal() {
  const modal = document.getElementById('investModal');
  if (modal) modal.classList.remove('open');
  _investFarm = null;
}

function updateInvestSummary() {
  const amt = parseFloat(document.getElementById('investAmount')?.value) || 0;
  const el = document.getElementById('investSummaryAmt');
  const elSol = document.getElementById('investSummarySol');
  const elReturn = document.getElementById('investSummaryReturn');
  if (el) el.textContent = '$' + amt.toLocaleString();
  if (elSol) elSol.textContent = formatSOL(amt) + ' SOL';
  if (elReturn && _investFarm) {
    const est = amt * (1 + _investFarm.roi.max/100);
    elReturn.textContent = '$' + est.toFixed(2);
  }
}

function setQuickAmount(amt) {
  const el = document.getElementById('investAmount');
  if (el) { el.value = amt; updateInvestSummary(); }
}

async function confirmInvestment() {
  if (!WalletManager.isConnected() || !_investFarm) return;
  const amt = parseFloat(document.getElementById('investAmount')?.value);
  if (!amt || amt <= 0) { showToast('error', 'Invalid Amount', 'Enter an amount greater than 0'); return; }
  const btn = document.getElementById('btnConfirmInvest');
  if (btn) { btn.disabled = true; btn.textContent = 'Processing...'; }

  // Simulate devnet transaction
  await new Promise(r => setTimeout(r, 2200));
  closeInvestModal();
  showToast('success', 'Investment Confirmed!', `$${amt.toLocaleString()} invested in ${_investFarm.name}`);
  if (btn) { btn.disabled = false; btn.textContent = 'Confirm Investment'; }

  // Refresh portfolio if on investor page
  if (typeof refreshPortfolio === 'function') refreshPortfolio();
}

function investModalHTML() {
  return `
  <div class="modal-overlay" id="investModal">
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">Invest in Farm</span>
        <button class="modal-close" onclick="closeInvestModal()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <div style="background:rgba(0,255,135,.05);border:1px solid rgba(0,255,135,.12);border-radius:10px;padding:.85rem 1rem;margin-bottom:1.25rem">
          <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:3px">Farm</div>
          <div style="font-family:'Cabinet Grotesk',sans-serif;font-weight:800;font-size:.95rem" id="investFarmName">—</div>
          <div style="display:flex;gap:1rem;margin-top:.5rem">
            <span style="font-size:.75rem;color:var(--muted)">APY: <strong style="color:var(--green)" id="investApy">—</strong></span>
            <span style="font-size:.75rem;color:var(--muted)">Harvest: <strong style="color:var(--text)" id="investCycle">—</strong></span>
          </div>
        </div>
        <div class="banner info" style="margin-bottom:1.25rem;font-size:.78rem">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          <span>This is a <strong>devnet transaction</strong>. Get free test SOL from our <a onclick="closeInvestModal();openDiscordGuide()">Discord faucet</a> first.</span>
        </div>
        <div class="form-group">
          <label class="form-label">Investment Amount (USD)</label>
          <div class="invest-amount-input">
            <input class="form-input" type="number" id="investAmount" placeholder="0.00" oninput="updateInvestSummary()" min="10">
            <span class="currency">USD</span>
          </div>
          <div class="invest-quick">
            <button onclick="setQuickAmount(100)">$100</button>
            <button onclick="setQuickAmount(500)">$500</button>
            <button onclick="setQuickAmount(1000)">$1,000</button>
            <button onclick="setQuickAmount(5000)">$5,000</button>
          </div>
        </div>
        <div class="invest-summary">
          <div class="invest-summary-row"><span>Amount</span><span class="val" id="investSummaryAmt">$0</span></div>
          <div class="invest-summary-row"><span>Equivalent SOL</span><span class="val" id="investSummarySol">0 SOL</span></div>
          <div class="invest-summary-row"><span>Estimated Return</span><span class="val green" id="investSummaryReturn">$0</span></div>
          <div class="invest-summary-row"><span>Network</span><span class="val" style="color:var(--muted)">Solana Devnet</span></div>
        </div>
        <button class="btn-primary" style="width:100%;justify-content:center;margin-top:1.25rem" id="btnConfirmInvest" onclick="confirmInvestment()">Confirm Investment</button>
      </div>
    </div>
  </div>`;
}

// Discord faucet guide modal
function openDiscordGuide() {
  showToast('info', 'Get Test SOL', 'Join our Discord → #get-test-sol → Post your wallet address → Bot sends devnet SOL');
}

// Nav shared HTML builder
function buildNav(activePage, mode) {
  const isInvestor = mode === 'investor';
  const links = isInvestor
    ? [
        { href: 'investor.html#dashboard',  label: 'Dashboard',  id: 'dashboard' },
        { href: 'investor.html#farms',       label: 'All Farms',  id: 'farms' },
        { href: 'investor.html#portfolio',   label: 'Portfolio',  id: 'portfolio' },
        { href: 'investor.html#history',     label: 'History',    id: 'history' },
      ]
    : [
        { href: 'farmer.html#overview',      label: 'Overview',   id: 'overview' },
        { href: 'farmer.html#farms',         label: 'My Farms',   id: 'farms' },
        { href: 'farmer.html#list',          label: 'List Farm',  id: 'list' },
        { href: 'farmer.html#payouts',       label: 'Payouts',    id: 'payouts' },
      ];

  return `
  <nav class="nav">
    <div class="nav-left">
      <img src="assets/logo.png" alt="AgricFi" class="nav-logo">
      <span class="nav-brand">AgricFi</span>
      <span class="nav-mode-badge ${mode}">${isInvestor ? 'Investor' : 'Farmer'}</span>
    </div>
    <div class="nav-center" id="navCenter">
      ${links.map(l => `<a href="${l.href}" class="nav-link ${activePage===l.id?'active':''}">${l.label}</a>`).join('')}
    </div>
    <div class="nav-right">
      <div class="btn-copy-addr" id="addrChip" style="display:none" onclick="copyWalletAddress()" title="Copy wallet address">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        <span class="addr-text"></span>
      </div>
      <button id="btnWallet" class="btn-wallet" onclick="openWalletModal()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8L2 7h20l-6-4z"/></svg>
        Connect Wallet
      </button>
      <button class="nav-switch" id="navSwitch" onclick="switchMode('${isInvestor?'farmer':'investor'}')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>
        ${isInvestor ? 'Farmer Portal' : 'Investor Portal'}
      </button>
      <div class="hamburger" id="hamburger" onclick="toggleMobileMenu()">
        <span></span><span></span><span></span>
      </div>
    </div>
  </nav>
  <div id="mobileMenu" style="display:none;position:fixed;top:64px;left:0;right:0;z-index:199;background:rgba(2,8,4,.97);backdrop-filter:blur(20px);border-bottom:1px solid var(--border);padding:1rem" class="mobile-menu">
    ${links.map(l => `<a href="${l.href}" class="nav-link ${activePage===l.id?'active':''}" style="padding:.75rem 1rem;display:block">${l.label}</a>`).join('')}
  </div>`;
}

function toggleMobileMenu() {
  const m = document.getElementById('mobileMenu');
  if (m) m.style.display = m.style.display === 'none' ? 'block' : 'none';
}

function switchMode(mode) {
  window.location.href = mode === 'investor' ? 'investor.html' : 'farmer.html';
}

// Init on page load — restore wallet session
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

