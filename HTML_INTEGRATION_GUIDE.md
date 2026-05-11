# AgricFi HTML Integration Guide — Wallet Adapter Setup

## Quick Start

This guide shows you exactly **how to update your existing HTML files** to use the new wallet adapter for cross-platform support.

---

## Step 1: Update HTML File Structure

### Location of Changes
Add these script tags to the **END of your HTML file**, right before `</body>`:

```html
<!-- At the bottom of index.html, investor.html, and farmer.html -->

<!-- Solana Web3.js Library -->
<script src="https://cdn.jsdelivr.net/npm/@solana/web3.js@1.91.1/lib/index.iife.js"></script>

<!-- Wallet Adapters (Desktop + Mobile) -->
<script src="https://cdn.jsdelivr.net/npm/@solana/wallet-adapter-base@0.9.23/lib/index.iife.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@solana/wallet-adapter-phantom@0.9.24/lib/index.iife.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@solana/wallet-adapter-solflare@0.6.8/lib/index.iife.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@solana/wallet-adapter-backpack@0.1.3/lib/index.iife.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@solana/wallet-adapter-glow@0.2.1/lib/index.iife.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@solana/wallet-adapter-walletconnect@0.1.7/lib/index.iife.js"></script>

<!-- AgricFi Wallet Manager (NEW) -->
<script src="wallet-adapter.js"></script>

<!-- AgricFi UI Helpers (EXISTING) -->
<script src="wallet.js"></script>

<!-- Initialize Wallet on Page Load -->
<script>
  document.addEventListener('DOMContentLoaded', async () => {
    await initWallet();
  });
</script>

</body>
```

---

## Step 2: Update Investment Function

### Current Code (in wallet.js - line 457)
```javascript
async function confirmInvestment() {
  if (!WalletManager.isConnected() || !_investFarm) return;
  const amt = parseFloat(document.getElementById('investAmount')?.value);
  if (!amt || amt <= 0) { 
    showToast('error', 'Invalid Amount', 'Enter an amount greater than 0'); 
    return; 
  }
  const btn = document.getElementById('btnConfirmInvest');
  if (btn) { btn.disabled = true; btn.textContent = 'Processing...'; }

  // ❌ OLD: Simulate devnet transaction
  await new Promise(r => setTimeout(r, 2200));
  closeInvestModal();
  showToast('success', 'Investment Confirmed!', `$${amt.toLocaleString()} invested in ${_investFarm.name}`);
  if (btn) { btn.disabled = false; btn.textContent = 'Confirm Investment'; }

  if (typeof refreshPortfolio === 'function') refreshPortfolio();
}
```

### Updated Code (with wallet signing)
```javascript
async function confirmInvestment() {
  if (!WalletManager.isConnected() || !_investFarm) return;
  
  const amt = parseFloat(document.getElementById('investAmount')?.value);
  if (!amt || amt <= 0) { 
    showToast('error', 'Invalid Amount', 'Enter an amount greater than 0'); 
    return; 
  }

  const btn = document.getElementById('btnConfirmInvest');
  if (btn) { 
    btn.disabled = true; 
    btn.textContent = 'Processing...'; 
  }

  try {
    // 1. Create Solana transaction
    const connection = new solanaWeb3.Connection(
      'https://api.devnet.solana.com',
      'confirmed'
    );

    const userPublicKey = WalletManager.getPublicKey();
    const transaction = new solanaWeb3.Transaction();

    // 2. Add your investment instruction here
    // Example: Send to treasury, mint NFT certificate, update pool, etc.
    // const instruction = await createInvestmentInstruction(...);
    // transaction.add(instruction);

    // For now, simulate with a simple system instruction
    transaction.add(
      solanaWeb3.SystemProgram.transfer({
        fromPubkey: userPublicKey,
        toPubkey: new solanaWeb3.PublicKey('11111111111111111111111111111111'), // Demo address
        lamports: 1000, // Demo amount
      })
    );

    transaction.feePayer = userPublicKey;
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;

    // 3. Sign transaction with wallet
    const signedTx = await WalletManager.signTransaction(transaction);
    
    if (!signedTx) {
      throw new Error('Transaction signing failed');
    }

    showToast('info', 'Broadcasting...', 'Sending transaction to blockchain');

    // 4. Send signed transaction
    const txId = await connection.sendRawTransaction(
      signedTx.serialize(),
      { skipPreflight: true }
    );

    // 5. Wait for confirmation
    await connection.confirmTransaction(txId, 'confirmed');

    // 6. Success!
    closeInvestModal();
    showToast('success', 'Investment Confirmed!', `
      <div>
        Amount: $${amt.toLocaleString()}<br>
        Farm: ${_investFarm.name}<br>
        TX: <a href="https://explorer.solana.com/tx/${txId}?cluster=devnet" target="_blank" style="color:#00ff87">View on Solana Explorer</a>
      </div>
    `);

    if (typeof refreshPortfolio === 'function') {
      refreshPortfolio();
    }

  } catch (error) {
    console.error('Investment failed:', error);
    
    // Handle specific error types
    if (error.message.includes('User rejected')) {
      showToast('error', 'Rejected', 'You rejected the transaction');
    } else if (error.message.includes('insufficient funds')) {
      showToast('error', 'Insufficient SOL', 'Not enough SOL for gas fees');
    } else {
      showToast('error', 'Investment Failed', error.message || 'Please try again');
    }
  } finally {
    if (btn) { 
      btn.disabled = false; 
      btn.textContent = 'Confirm Investment'; 
    }
  }
}
```

---

## Step 3: Update HTML Modal Structure

### Wallet Connection Modal
Your existing modal HTML stays the same, but now it automatically shows mobile-optimized options:

```html
<!-- Add this to your HTML if you don't have it -->
<div class="modal-overlay" id="walletModal">
  <div class="modal">
    <div class="modal-header">
      <span class="modal-title">Connect Wallet</span>
      <button class="modal-close" onclick="closeWalletModal()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
    <div class="modal-body">
      <p style="font-size:.85rem;color:var(--muted);margin-bottom:1.25rem">
        Choose your Solana-compatible wallet to invest in farms.
      </p>
      <div id="walletOptions"></div>
      <p style="font-size:.7rem;color:var(--muted);margin-top:1.25rem;text-align:center">
        By connecting, you confirm you are using Solana Devnet for testing.
      </p>
    </div>
  </div>
</div>
```

---

## Step 4: Update CSS (if needed)

Add these styles to your `style.css` for the recommended badge:

```css
.wallet-option.recommended {
  border: 2px solid var(--green);
  background: rgba(0, 255, 135, 0.05);
}

.wallet-badge {
  background: var(--green);
  color: var(--bg);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  white-space: nowrap;
}

.wallet-option {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 0.75rem;
}

.wallet-option:hover {
  border-color: var(--green);
  background: rgba(0, 255, 135, 0.03);
}

.wallet-option img {
  width: 28px;
  height: 28px;
  border-radius: 4px;
}

.wallet-info {
  flex: 1;
}

.wallet-name {
  font-weight: 600;
  margin-bottom: 2px;
}

.wallet-desc {
  font-size: 0.75rem;
  color: var(--muted);
}
```

---

## Step 5: Test the Implementation

### Desktop Testing
1. Open `index.html` in browser
2. Click "Connect Wallet"
3. Select Phantom/Solflare/Backpack
4. Should connect immediately ✅

### Mobile Testing
1. Install Phantom or Solflare app on phone
2. Open browser and go to `http://YOUR_IP:8000`
3. Click "Connect Wallet"
4. Select your wallet
5. Should deep-link to app ✅

### Investment Testing
1. Connect wallet (get devnet SOL from Discord faucet first)
2. Click "Invest with SOL"
3. Enter amount
4. Click "Confirm Investment"
5. Sign in wallet popup
6. Transaction should appear on Solana Explorer ✅

---

## Complete Example HTML File

Here's a minimal working example:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AgricFi - Wallet Integration</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <!-- Your existing content -->
  <nav id="nav"></nav>
  <main id="main"></main>

  <!-- Wallet Modal -->
  <div class="modal-overlay" id="walletModal" style="display:none">
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">Connect Wallet</span>
        <button class="modal-close" onclick="closeWalletModal()">✕</button>
      </div>
      <div class="modal-body">
        <p>Choose your Solana wallet</p>
        <div id="walletOptions"></div>
      </div>
    </div>
  </div>

  <!-- Investment Modal -->
  <div class="modal-overlay" id="investModal" style="display:none">
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">Invest in Farm</span>
        <button class="modal-close" onclick="closeInvestModal()">✕</button>
      </div>
      <div class="modal-body">
        <label>Investment Amount (USD)</label>
        <input type="number" id="investAmount" placeholder="0.00" min="10">
        <button onclick="confirmInvestment()" id="btnConfirmInvest">Confirm Investment</button>
      </div>
    </div>
  </div>

  <!-- Scripts -->
  <script src="https://cdn.jsdelivr.net/npm/@solana/web3.js@1.91.1/lib/index.iife.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@solana/wallet-adapter-base@0.9.23/lib/index.iife.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@solana/wallet-adapter-phantom@0.9.24/lib/index.iife.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@solana/wallet-adapter-solflare@0.6.8/lib/index.iife.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@solana/wallet-adapter-backpack@0.1.3/lib/index.iife.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@solana/wallet-adapter-glow@0.2.1/lib/index.iise.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@solana/wallet-adapter-walletconnect@0.1.7/lib/index.iise.js"></script>

  <script src="wallet-adapter.js"></script>
  <script src="wallet.js"></script>
  <script src="data.js"></script>

  <script>
    document.addEventListener('DOMContentLoaded', async () => {
      await initWallet();
      // Your page-specific code
    });
  </script>
</body>
</html>
```

---

## Common Implementation Patterns

### Pattern 1: Mobile-Specific Logic
```javascript
if (WalletManager.isMobile()) {
  // Show mobile-optimized UI
  document.querySelector('.wallet-list').classList.add('mobile');
}
```

### Pattern 2: Wallet Name Checking
```javascript
const walletName = WalletManager.getName();
if (walletName === 'Phantom') {
  // Phantom-specific logic
}
```

### Pattern 3: Auto-Reconnect
```javascript
async function checkWalletOnLoad() {
  const restored = await WalletManager.restore();
  if (restored) {
    console.log('Wallet auto-connected:', WalletManager.getAddress());
  }
}
```

### Pattern 4: Custom Transaction Signing
```javascript
async function approveTransaction() {
  try {
    const tx = new solanaWeb3.Transaction();
    // Add instructions
    const signed = await WalletManager.signTransaction(tx);
    // Send to blockchain
  } catch (error) {
    showToast('error', 'Failed', error.message);
  }
}
```

---

## Troubleshooting

### "Script not found" error
**Solution**: Check CDN URLs are correct and internet connection is working

### Wallet doesn't appear in modal
**Solution**: Make sure wallet extension is installed on desktop or app installed on mobile

### "Not connected" when trying to invest
**Solution**: Add guard clause:
```javascript
if (!WalletManager.isConnected()) {
  openWalletModal();
  return;
}
```

### Mobile shows blank wallet list
**Solution**: Mobile wallets need app installation. WalletConnect should appear as fallback

### Transaction signing fails
**Solution**: User rejected or wallet incompatible. Show user-friendly error:
```javascript
} catch (error) {
  if (error.message.includes('User rejected')) {
    showToast('info', 'Cancelled', 'You rejected the transaction');
  } else {
    showToast('error', 'Error', 'Failed to sign transaction');
  }
}
```

---

## What Changed in Your Code

| Feature | Old | New |
|---------|-----|-----|
| PC Only | window.solana, window.solflare | Wallet Adapter + WalletConnect |
| Mobile Support | ❌ No | ✅ Yes (Phantom, Solflare, Glow) |
| Transaction Signing | ❌ No | ✅ Full support |
| Message Signing | ❌ No | ✅ Full support |
| In-App Browser | ❌ No | ✅ Detected automatically |
| Session Restore | ✅ Yes | ✅ Yes (improved) |
| Error Handling | Basic | ✅ Comprehensive |

---

## Next Steps

1. **Update your HTML files** - Add script tags from Step 1
2. **Update investment function** - Replace with code from Step 2
3. **Add CSS** - Copy styles from Step 4
4. **Test on Desktop** - Phantom/Solflare/Backpack
5. **Test on Mobile** - Install apps and test deep-linking
6. **Deploy** - Push to production when ready

---

## Need Help?

- Check `WALLET_SETUP.md` for detailed documentation
- Review `wallet-adapter.js` for all available methods
- Check browser console for error messages
- Test with devnet first (never mainnet without audit)

