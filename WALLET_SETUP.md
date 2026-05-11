# AgricFi Wallet Integration Setup Guide

## Overview

This guide covers the implementation of Solana Wallet Adapter for **cross-platform wallet support** on AgricFi. The solution works on:

- ✅ **Desktop**: Phantom, Solflare, Backpack
- ✅ **Mobile**: Phantom, Solflare, Glow, WalletConnect
- ✅ **In-App Browsers**: Direct wallet communication in wallet apps

---

## Installation

### Step 1: Install Dependencies

```bash
npm install
```

Or individually:

```bash
npm install @solana/web3.js \
  @solana/wallet-adapter-base \
  @solana/wallet-adapter-phantom \
  @solana/wallet-adapter-solflare \
  @solana/wallet-adapter-backpack \
  @solana/wallet-adapter-glow \
  @solana/wallet-adapter-walletconnect
```

### Step 2: Update HTML Files

In your `index.html`, `investor.html`, and `farmer.html`, add these script tags **before** closing `</body>`:

```html
<!-- Solana Web3.js -->
<script src="https://cdn.jsdelivr.net/npm/@solana/web3.js@latest/lib/index.iife.js"></script>

<!-- Wallet Adapters -->
<script src="https://cdn.jsdelivr.net/npm/@solana/wallet-adapter-phantom@latest/lib/index.iife.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@solana/wallet-adapter-solflare@latest/lib/index.iife.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@solana/wallet-adapter-backpack@latest/lib/index.iife.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@solana/wallet-adapter-glow@latest/lib/index.iife.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@solana/wallet-adapter-walletconnect@latest/lib/index.iife.js"></script>

<!-- Your wallet adapter code -->
<script src="wallet-adapter.js"></script>
<script src="wallet.js"></script> <!-- Keep existing wallet.js for UI helpers -->
<script>
  // Initialize on page load
  document.addEventListener('DOMContentLoaded', () => {
    initWallet();
  });
</script>
```

---

## Key Improvements Over Old Implementation

### Problem 1: Mobile Wallet Redirection
**Old**: Phantom/Solflare opened download page on mobile  
**New**: Uses deep-linking and WalletConnect for mobile support

```javascript
// Desktop fallback
phantom: 'https://phantom.app/'

// Mobile deep-link (redirects to app if installed, download page if not)
phantom: isMobile() 
  ? 'https://phantom.app/ul/browse?url=' + encodeURIComponent(window.location.href)
  : 'https://phantom.app/'
```

### Problem 2: PC-Only Connection
**Old**: Only checked `window.solana` and `window.solflare`  
**New**: Detects desktop, mobile, and in-app browser environments

```javascript
function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isInApp() {
  const ua = navigator.userAgent;
  return /Phantom|Solflare|Glow/i.test(ua);
}
```

### Problem 3: No Signing Support
**Old**: Only detected wallets, no transaction signing  
**New**: Full signing support for transactions and messages

```javascript
// Sign transactions for investments
async function signAndSendTransaction(transaction) {
  const signed = await WalletManager.signTransaction(transaction);
  // Send to blockchain
}

// Sign messages for authentication
const signature = await WalletManager.signMessage('Verify ownership');
```

---

## Usage Examples

### Connect Wallet

```javascript
// User clicks wallet option
await WalletManager.connect('phantom');

// Returns: { success: true, address: '...', name: 'Phantom' }
```

### Check Connection Status

```javascript
if (WalletManager.isConnected()) {
  const address = WalletManager.getAddress();
  console.log('Connected to:', address);
}
```

### Sign and Send Investment Transaction

```javascript
async function confirmInvestment() {
  const amount = parseFloat(document.getElementById('investAmount').value);
  
  try {
    // Create transaction
    const transaction = new solanaWeb3.Transaction();
    // ... add instructions ...
    
    // Sign with wallet
    const signed = await WalletManager.signTransaction(transaction);
    
    // Send to blockchain
    const connection = new solanaWeb3.Connection(
      'https://api.devnet.solana.com',
      'confirmed'
    );
    const txId = await connection.sendRawTransaction(signed.serialize());
    
    showToast('success', 'Transaction Sent', txId);
  } catch(e) {
    showToast('error', 'Investment Failed', e.message);
  }
}
```

### Mobile Wallet Detection

```javascript
if (WalletManager.isMobile()) {
  // Show mobile-optimized wallet list
  console.log('Detected mobile device');
}

if (WalletManager.isInApp()) {
  // User is in wallet's in-app browser
  console.log('In-app browser detected');
}
```

---

## File Structure

```
AgricFi-MVP/
├── package.json                 # Dependencies (NEW)
├── wallet-adapter.js            # Wallet Adapter Manager (NEW)
├── wallet.js                    # UI Helpers (EXISTING)
├── index.html                   # Landing page
├── investor.html                # Investor portal
├── farmer.html                  # Farmer portal
├── data.js                      # Farm data
├── style.css                    # Styles
└── WALLET_SETUP.md             # This file
```

---

## Environment Variables (Optional)

Create a `.env` file for blockchain configuration:

```env
VITE_SOLANA_RPC=https://api.devnet.solana.com
VITE_NETWORK=devnet
VITE_TOKEN_MINT=YOUR_TOKEN_MINT_ADDRESS
```

Access in code:
```javascript
const rpc = process.env.VITE_SOLANA_RPC || 'https://api.devnet.solana.com';
```

---

## Testing

### Local Development

```bash
npm run dev
# Opens http://localhost:8080 in browser
```

### Test on Mobile

1. Get your local IP: `ipconfig getifaddr en0` (Mac) or `ipconfig` (Windows)
2. Open in mobile browser: `http://YOUR_IP:8080`
3. Install Phantom/Solflare on mobile
4. Click "Connect Wallet"

### Test on Devnet

Get free test SOL:
```bash
# In Discord #get-test-sol channel
Post your wallet address and get tokens from the faucet
```

Or via CLI:
```bash
solana airdrop 2 YOUR_ADDRESS --url devnet
```

---

## Common Issues & Solutions

### Issue 1: "Wallet not installed" on mobile
**Solution**: User is trying on mobile device without wallet app
- Implementation shows install link
- Deep-link automatically opens app if installed
- Falls back to WalletConnect for universal access

### Issue 2: "Connection rejected" 
**Solution**: User denied permission in wallet
- Show clear message
- Allow retry without page reload
- Check `onlyIfTrusted` for silent reconnects

### Issue 3: Transaction signing fails
**Solution**: Wallet doesn't support signing or user rejected
```javascript
try {
  const signed = await WalletManager.signTransaction(tx);
} catch(e) {
  showToast('error', 'Signing Failed', 'User rejected or wallet incompatible');
}
```

### Issue 4: Phantom opens in browser instead of app (mobile)
**Solution**: The new implementation uses deep-links:
```javascript
// Old (broken on mobile):
'https://phantom.app/'

// New (opens app on mobile):
isMobile() ? 'https://phantom.app/ul/browse?url=...' : 'https://phantom.app/'
```

---

## API Reference

### WalletManager Methods

```javascript
// Initialization
await WalletManager.initAdapter()           // Initialize adapters
await WalletManager.restore()                // Restore previous session

// Connection
await WalletManager.connect(walletId)       // Connect to wallet
await WalletManager.disconnect()             // Disconnect

// Signing
await WalletManager.signTransaction(tx)     // Sign transaction
await WalletManager.signMessage(msg)        // Sign message

// State & Info
WalletManager.isConnected()                  // Boolean
WalletManager.getAddress()                   // Wallet address
WalletManager.getPublicKey()                 // PublicKey object
WalletManager.getName()                      // Wallet name
WalletManager.getState()                     // Full state
WalletManager.formatAddress(addr)            // Format as XXX...XXX
await WalletManager.copyAddress()            // Copy to clipboard

// Detection
WalletManager.detectWallets()                // Array of installed wallets
WalletManager.isMobile()                     // Is mobile device
WalletManager.isInApp()                      // Is in-app browser
```

---

## Security Considerations

1. **Private Keys**: Never exposed by wallet adapter
2. **Signing**: Always requires user approval
3. **Session Storage**: Uses localStorage (user can clear)
4. **Devnet Testing**: Only use devnet for development
5. **Message Signing**: Verify origin before asking to sign

---

## Next Steps

1. ✅ Install dependencies (`npm install`)
2. ✅ Update HTML files with script tags
3. ✅ Replace wallet connection in `confirmInvestment()` function
4. ✅ Add transaction creation and signing
5. ✅ Test on desktop
6. ✅ Test on mobile with actual wallet apps
7. Deploy to production

---

## Support & Resources

- [Solana Wallet Adapter Docs](https://github.com/solana-labs/wallet-adapter)
- [Phantom Docs](https://docs.phantom.app/)
- [Solflare Docs](https://docs.solflare.com/)
- [Solana Web3.js API](https://solana-labs.github.io/solana-web3.js/)
- [AgricFi Discord](https://discord.gg/agricfi)

