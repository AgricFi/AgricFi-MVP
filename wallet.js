```javascript
// ─────────────────────────────────────────────
// AgricFi Wallet Manager — Stable Production MVP
// Supports:
// - Phantom
// - Solflare
// - Backpack
// Solana Devnet Ready
// ─────────────────────────────────────────────

const WalletManager = (() => {

  const STORAGE_KEY = 'agricfi_wallet_v1';

  let state = {
    connected: false,
    address: null,
    provider: null,
    walletId: null,
    walletName: null
  };

  // ─────────────────────────────────────────────
  // Detect Installed Wallets
  // ─────────────────────────────────────────────

  function detectWallets() {

    const wallets = [];

    // Phantom
    if (window.phantom?.solana?.isPhantom) {
      wallets.push({
        id: 'phantom',
        name: 'Phantom',
        provider: window.phantom.solana
      });
    }

    // Solflare
    if (window.solflare?.isSolflare) {
      wallets.push({
        id: 'solflare',
        name: 'Solflare',
        provider: window.solflare
      });
    }

    // Backpack
    if (window.backpack?.solana) {
      wallets.push({
        id: 'backpack',
        name: 'Backpack',
        provider: window.backpack.solana
      });
    }

    return wallets;
  }

  // ─────────────────────────────────────────────
  // Connect Wallet
  // ─────────────────────────────────────────────

  async function connect(walletId) {

    const wallets = detectWallets();

    const wallet = wallets.find(w => w.id === walletId);

    // Wallet not installed
    if (!wallet) {

      const installLinks = {
        phantom: 'https://phantom.app/',
        solflare: 'https://solflare.com/',
        backpack: 'https://backpack.app/'
      };

      if (installLinks[walletId]) {
        window.open(installLinks[walletId], '_blank');
      }

      return {
        success: false,
        error: 'Wallet not installed'
      };
    }

    try {

      // Connect
      await wallet.provider.connect();

      // Get address safely
      const address =
        wallet.provider.publicKey?.toString()
        || wallet.provider.selectedAddress;

      if (!address) {
        throw new Error('Wallet address not found');
      }

      // Save state
      state = {
        connected: true,
        address,
        provider: wallet.provider,
        walletId: wallet.id,
        walletName: wallet.name
      };

      // Persist
      persist();

      // Watch events
      watchWallet();

      return {
        success: true,
        address,
        wallet: wallet.name
      };

    } catch (err) {

      return {
        success: false,
        error: err?.message || 'Connection rejected'
      };
    }
  }

  // ─────────────────────────────────────────────
  // Disconnect Wallet
  // ─────────────────────────────────────────────

  async function disconnect() {

    try {

      if (state.provider?.disconnect) {
        await state.provider.disconnect();
      }

    } catch (e) {}

    state = {
      connected: false,
      address: null,
      provider: null,
      walletId: null,
      walletName: null
    };

    localStorage.removeItem(STORAGE_KEY);

    return true;
  }

  // ─────────────────────────────────────────────
  // Persist Session
  // ─────────────────────────────────────────────

  function persist() {

    if (!state.connected) return;

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        walletId: state.walletId,
        address: state.address,
        walletName: state.walletName
      })
    );
  }

  // ─────────────────────────────────────────────
  // Restore Session
  // ─────────────────────────────────────────────

  async function restore() {

    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) return false;

    try {

      const data = JSON.parse(saved);

      const wallets = detectWallets();

      const wallet = wallets.find(
        w => w.id === data.walletId
      );

      if (!wallet) {
        localStorage.removeItem(STORAGE_KEY);
        return false;
      }

      try {

        // Silent reconnect
        await wallet.provider.connect({
          onlyIfTrusted: true
        });

        const address =
          wallet.provider.publicKey?.toString()
          || data.address;

        if (!address) return false;

        state = {
          connected: true,
          address,
          provider: wallet.provider,
          walletId: wallet.id,
          walletName: wallet.name
        };

        watchWallet();

        return true;

      } catch (e) {

        localStorage.removeItem(STORAGE_KEY);

        return false;
      }

    } catch (e) {

      localStorage.removeItem(STORAGE_KEY);

      return false;
    }
  }

  // ─────────────────────────────────────────────
  // Watch Wallet Events
  // ─────────────────────────────────────────────

  function watchWallet() {

    if (!state.provider) return;

    // Disconnect
    state.provider.on?.('disconnect', async () => {

      await disconnect();

      updateWalletUI();

      showToast(
        'info',
        'Disconnected',
        'Wallet disconnected'
      );
    });

    // Account changed
    state.provider.on?.('accountChanged', async (pk) => {

      if (!pk) {

        await disconnect();

        updateWalletUI();

        return;
      }

      state.address = pk.toString();

      persist();

      updateWalletUI();
    });
  }

  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────

  function isConnected() {
    return state.connected;
  }

  function getAddress() {
    return state.address;
  }

  function getWalletName() {
    return state.walletName;
  }

  function shortAddress(address) {

    const addr = address || state.address;

    if (!addr) return '';

    return addr.slice(0, 4)
      + '...'
      + addr.slice(-4);
  }

  async function copyAddress() {

    if (!state.address) return false;

    try {

      await navigator.clipboard.writeText(
        state.address
      );

      return true;

    } catch (e) {

      return false;
    }
  }

  // ─────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────

  return {
    detectWallets,
    connect,
    disconnect,
    restore,
    isConnected,
    getAddress,
    getWalletName,
    shortAddress,
    copyAddress
  };

})();


// ─────────────────────────────────────────────
// UI Functions
// ─────────────────────────────────────────────

// Open Wallet Modal
function openWalletModal() {

  const modal = document.getElementById(
    'walletModal'
  );

  if (!modal) return;

  modal.classList.add('open');

  renderWalletOptions();
}

// Close Wallet Modal
function closeWalletModal() {

  const modal = document.getElementById(
    'walletModal'
  );

  if (!modal) return;

  modal.classList.remove('open');
}

// Render Wallet Options
function renderWalletOptions() {

  const container = document.getElementById(
    'walletOptions'
  );

  if (!container) return;

  const detected =
    WalletManager.detectWallets();

  const installedIds =
    detected.map(w => w.id);

  const wallets = [
    {
      id: 'phantom',
      name: 'Phantom',
      desc: 'Popular Solana wallet'
    },
    {
      id: 'solflare',
      name: 'Solflare',
      desc: 'Secure Solana wallet'
    },
    {
      id: 'backpack',
      name: 'Backpack',
      desc: 'Coral wallet'
    }
  ];

  container.innerHTML = wallets.map(w => `

    <div class="wallet-option"
         onclick="connectWalletUI('${w.id}')">

      <div class="wallet-left">

        <div class="wallet-name">
          ${w.name}
        </div>

        <div class="wallet-desc">
          ${w.desc}
        </div>

      </div>

      ${
        installedIds.includes(w.id)
        ? '<span class="wallet-installed">Detected</span>'
        : '<span class="wallet-install">Install</span>'
      }

    </div>

  `).join('');
}

// Connect UI
async function connectWalletUI(walletId) {

  closeWalletModal();

  showToast(
    'info',
    'Connecting',
    'Opening wallet...'
  );

  const result =
    await WalletManager.connect(walletId);

  if (result.success) {

    updateWalletUI();

    showToast(
      'success',
      'Connected',
      WalletManager.shortAddress(
        result.address
      )
    );

  } else {

    showToast(
      'error',
      'Connection Failed',
      result.error
    );
  }
}

// Disconnect UI
async function disconnectWalletUI() {

  await WalletManager.disconnect();

  updateWalletUI();

  showToast(
    'info',
    'Disconnected',
    'Wallet disconnected'
  );
}

// Update Wallet Button
function updateWalletUI() {

  const btn =
    document.getElementById('btnWallet');

  if (!btn) return;

  if (WalletManager.isConnected()) {

    btn.className =
      'btn-wallet connected';

    btn.innerHTML =
      WalletManager.shortAddress();

    btn.onclick =
      disconnectWalletUI;

  } else {

    btn.className =
      'btn-wallet';

    btn.innerHTML =
      'Connect Wallet';

    btn.onclick =
      openWalletModal;
  }
}

// Copy Wallet
async function copyWalletAddress() {

  const ok =
    await WalletManager.copyAddress();

  if (ok) {

    showToast(
      'success',
      'Copied',
      'Wallet address copied'
    );
  }
}

// ─────────────────────────────────────────────
// Toast Notification
// ─────────────────────────────────────────────

function showToast(type, title, message) {

  let container =
    document.getElementById('toastContainer');

  if (!container) {

    container = document.createElement('div');

    container.id = 'toastContainer';

    container.className = 'toast-container';

    document.body.appendChild(container);
  }

  const toast =
    document.createElement('div');

  toast.className =
    `toast ${type}`;

  toast.innerHTML = `
    <div class="toast-title">
      ${title}
    </div>
    <div class="toast-message">
      ${message}
    </div>
  `;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {

    toast.classList.remove('show');

    setTimeout(() => {
      toast.remove();
    }, 300);

  }, 4000);
}

// ─────────────────────────────────────────────
// Init App
// ─────────────────────────────────────────────

window.addEventListener('load', async () => {

  // Restore wallet session
  await WalletManager.restore();

  // Update UI
  updateWalletUI();

  console.log(
    'AgricFi Wallet Manager Ready'
  );
});
```
