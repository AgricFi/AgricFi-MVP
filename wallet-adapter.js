// ── AgricFi MVP — Wallet Manager (Solana Wallet Adapter Version) ──
// Uses @solana/wallet-adapter-react for cross-platform wallet support
// Supports desktop (Phantom, Solflare, Backpack) and mobile (Phantom, Solflare, Glow)

const WalletManager = (function() {
  const STORAGE_KEY = 'agricfi_wallet';
  const SOL_PRICE = 180; // Update this from your price feed
  
  let _state = { 
    connected: false, 
    address: null, 
    provider: null, 
    name: null,
    publicKey: null,
    signTransaction: null 
  };

  // ── Initialize Wallet Adapter
  // Call this once on page load after DOM is ready
  async function initAdapter() {
    try {
      // Create wallet instances for both desktop and mobile
      const walletAdapters = [
        // Desktop-first
        new PhantomWalletAdapter(),
        new SolflareWalletAdapter(),
        new BackpackWalletAdapter(),
        
        // Mobile-optimized
        new GlowWalletAdapter(),
        new SolletWalletAdapter(),
        
        // Fallback (universal WalletConnect)
        new WalletConnectAdapter({ network: 'devnet' })
      ];
      
      return walletAdapters;
    } catch(e) {
      console.error('Wallet Adapter init failed:', e);
      return [];
    }
  }

  // ── Detect available wallets
  function detectWallets() {
    const wallets = [];
    
    // Check for injected wallets (desktop)
    if (window.solana?.isPhantom) {
      wallets.push({ 
        id: 'phantom', 
        name: 'Phantom', 
        icon: 'https://cryptologos.cc/logos/phantom-solana-wallet-logo.png',
        adapter: new PhantomWalletAdapter(),
        support: ['desktop', 'mobile']
      });
    }
    
    if (window.solflare?.isSolflare) {
      wallets.push({ 
        id: 'solflare', 
        name: 'Solflare', 
        icon: 'https://cryptologos.cc/logos/solflare-logo.png',
        adapter: new SolflareWalletAdapter(),
        support: ['desktop', 'mobile']
      });
    }
    
    if (window.backpack) {
      wallets.push({ 
        id: 'backpack', 
        name: 'Backpack', 
        icon: 'https://backpack.app/logo.png',
        adapter: new BackpackWalletAdapter(),
        support: ['desktop']
      });
    }
    
    if (window.glow) {
      wallets.push({ 
        id: 'glow', 
        name: 'Glow', 
        icon: 'https://app.glow.app/logo.png',
        adapter: new GlowWalletAdapter(),
        support: ['mobile']
      });
    }
    
    // Add default mobile wallets
    if (isMobile()) {
      wallets.push({ 
        id: 'mobile-fallback', 
        name: 'Mobile Wallet Connect', 
        icon: 'https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/walletconnect/src/icon.svg',
        adapter: new WalletConnectAdapter({ network: 'devnet' }),
        support: ['mobile']
      });
    }
    
    return wallets;
  }

  // ── Platform detection
  function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  function isInApp() {
    // Detect if app is open in wallet in-app browser
    const userAgent = navigator.userAgent;
    return (
      /Phantom/i.test(userAgent) || 
      /Solflare/i.test(userAgent) || 
      /Glow/i.test(userAgent)
    );
  }

  // ── Connect to wallet
  async function connect(walletId) {
    const allWallets = detectWallets();
    const walletConfig = allWallets.find(w => w.id === walletId);

    if (!walletConfig) {
      // Install link for desktop, deep-link for mobile
      const installUrls = {
        phantom: isMobile() 
          ? 'https://phantom.app/ul/browse?url=' + encodeURIComponent(window.location.href)
          : 'https://phantom.app/',
        solflare: isMobile()
          ? 'https://solflare.com/ul/browse?url=' + encodeURIComponent(window.location.href)
          : 'https://solflare.com/download',
        backpack: 'https://backpack.app/',
        glow: 'https://app.glow.app/download',
      };
      
      if (installUrls[walletId]) {
        window.open(installUrls[walletId], '_blank');
      }
      return { success: false, error: `${walletId} not installed. Please install it first.` };
    }

    try {
      const adapter = walletConfig.adapter;
      
      // Connect adapter
      await adapter.connect();
      
      if (!adapter.publicKey) {
        throw new Error('Failed to get public key after connection');
      }

      const address = adapter.publicKey.toString();
      
      _state = {
        connected: true,
        address,
        publicKey: adapter.publicKey,
        provider: adapter,
        name: walletConfig.name,
        signTransaction: adapter.signTransaction?.bind(adapter)
      };
      
      persist();
      setupWalletListeners(adapter);
      
      return { success: true, address, name: walletConfig.name };
    } catch (err) {
      console.error('Connection error:', err);
      return { 
        success: false, 
        error: err.message || 'Connection rejected or wallet not accessible'
      };
    }
  }

  // ── Setup event listeners
  function setupWalletListeners(adapter) {
    if (adapter.on) {
      adapter.on('disconnect', () => {
        disconnect();
        if (typeof onWalletDisconnected === 'function') {
          onWalletDisconnected();
        }
      });

      adapter.on('accountChanged', (pk) => {
        if (pk) {
          _state.publicKey = pk;
          _state.address = pk.toString();
        } else {
          disconnect();
        }
      });
    }
  }

  // ── Disconnect wallet
  async function disconnect() {
    try {
      if (_state.provider && _state.provider.disconnect) {
        await _state.provider.disconnect();
      }
    } catch(e) {
      console.error('Disconnect error:', e);
    }
    
    _state = { 
      connected: false, 
      address: null, 
      provider: null, 
      name: null,
      publicKey: null,
      signTransaction: null
    };
    localStorage.removeItem(STORAGE_KEY);
  }

  // ── Restore session from storage
  async function restore() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return false;
    
    try {
      const { address, name, walletId } = JSON.parse(saved);
      const allWallets = detectWallets();
      const walletConfig = allWallets.find(w => w.id === walletId);
      
      if (!walletConfig) return false;

      const adapter = walletConfig.adapter;
      
      try {
        // Try to auto-connect silently
        await adapter.connect({ onlyIfTrusted: true });
        
        if (adapter.publicKey) {
          _state = {
            connected: true,
            address: adapter.publicKey.toString(),
            publicKey: adapter.publicKey,
            provider: adapter,
            name: walletConfig.name,
            signTransaction: adapter.signTransaction?.bind(adapter)
          };
          setupWalletListeners(adapter);
          return true;
        }
      } catch(e) {
        // Silent fail - user may need to reconnect
        console.debug('Auto-reconnect failed:', e.message);
      }
    } catch(e) {
      console.error('Restore session error:', e);
    }
    
    return false;
  }

  // ── Sign transaction
  async function signTransaction(transaction) {
    if (!_state.signTransaction) {
      throw new Error('No wallet connected or wallet does not support signing');
    }
    
    try {
      const signed = await _state.signTransaction(transaction);
      return signed;
    } catch(e) {
      console.error('Transaction signing failed:', e);
      throw e;
    }
  }

  // ── Sign message
  async function signMessage(message) {
    if (!_state.provider || !_state.provider.signMessage) {
      throw new Error('Wallet does not support message signing');
    }
    
    const messageBuffer = typeof message === 'string' 
      ? new TextEncoder().encode(message)
      : message;
    
    try {
      const signature = await _state.provider.signMessage(messageBuffer);
      return signature;
    } catch(e) {
      console.error('Message signing failed:', e);
      throw e;
    }
  }

  // ── Persist wallet session
  function persist() {
    if (!_state.connected) return;
    
    const walletId = Object.entries({
      phantom: window.solana,
      solflare: window.solflare,
      backpack: window.backpack,
      glow: window.glow
    })
    .find(([_, provider]) => provider === _state.provider)?.[0] || 'unknown';
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      address: _state.address,
      name: _state.name,
      walletId
    }));
  }

  // ── Public API
  return {
    initAdapter,
    detectWallets,
    connect,
    disconnect,
    restore,
    signTransaction,
    signMessage,
    getState: () => ({ ..._state }),
    isConnected: () => _state.connected,
    getAddress: () => _state.address,
    getPublicKey: () => _state.publicKey,
    getName: () => _state.name,
    formatAddress: (addr) => {
      const a = addr || _state.address;
      if (!a) return '';
      return a.slice(0, 4) + '...' + a.slice(-4);
    },
    copyAddress: async () => {
      if (!_state.address) return false;
      try {
        await navigator.clipboard.writeText(_state.address);
        return true;
      } catch(e) {
        return false;
      }
    },
    isMobile,
    isInApp
  };
})();

// ── UI HELPERS ──

function buildWalletModal() {
  const installed = WalletManager.detectWallets();
  const isMobileDevice = WalletManager.isMobile();
  
  return installed.map(w => {
    const isRecommended = isMobileDevice && w.support?.includes('mobile');
    return `
    <div class="wallet-option ${isRecommended ? 'recommended' : ''}" onclick="handleWalletConnect('${w.id}')">
      <div class="wallet-icon">
        <img src="${w.icon}" alt="${w.name}" style="width:28px;height:28px;border-radius:4px">
      </div>
      <div class="wallet-info">
        <div class="wallet-name">${w.name}</div>
        <div class="wallet-desc">${w.support?.join(', ') || 'Compatible'}</div>
      </div>
      ${isRecommended ? '<span class="wallet-badge">Recommended</span>' : ''}
      <svg class="wallet-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
    </div>`;
  }).join('');
}

function updateWalletUI() {
  const state = WalletManager.getState();
  const btnWallet = document.getElementById('btnWallet');
  const addrChip = document.getElementById('addrChip');

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
    btnWallet.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8L2 7h20l-6-4z"/></svg>
      Connect Wallet`;
    btnWallet.onclick = () => openWalletModal();
    if (addrChip) addrChip.style.display = 'none';
  }
}

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

async function handleWalletConnect(walletId) {
  closeWalletModal();
  showToast('info', 'Connecting...', `Opening ${walletId} wallet`);
  
  try {
    const result = await WalletManager.connect(walletId);
    if (result.success) {
      showToast('success', 'Wallet Connected', `${result.name}: ${WalletManager.formatAddress(result.address)}`);
      updateWalletUI();
      if (typeof onWalletConnected === 'function') onWalletConnected(result);
    } else {
      showToast('error', 'Connection Failed', result.error || 'Please try again');
    }
  } catch(e) {
    showToast('error', 'Connection Error', e.message);
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

// Initialize wallet on page load
async function initWallet() {
  await WalletManager.initAdapter();
  const restored = await WalletManager.restore();
  if (restored) {
    updateWalletUI();
  }
  initParticles('particles');
  initReveal();
  initCounters();
}

// Transaction signing helper (use in investment function)
async function signAndSendTransaction(transaction) {
  try {
    if (!WalletManager.isConnected()) {
      throw new Error('Wallet not connected');
    }
    
    const signed = await WalletManager.signTransaction(transaction);
    // Send to blockchain here
    return signed;
  } catch(e) {
    showToast('error', 'Signing Failed', e.message);
    throw e;
  }
}
