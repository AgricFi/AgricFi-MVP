# AgricFi Wallet Adapter — Implementation Checklist

## 📋 Pre-Implementation

- [ ] Review all three setup documents:
  - `WALLET_SETUP.md` — Detailed setup guide
  - `HTML_INTEGRATION_GUIDE.md` — Code examples and patterns
  - `wallet-adapter.js` — New wallet manager code
  
- [ ] Backup your current `wallet.js` file
- [ ] Check Node.js version: `node --version` (should be ≥18.0.0)
- [ ] Test in a fresh browser (clear cache) to avoid conflicts

---

## 🛠️ Installation Steps

### Step 1: Install Dependencies
```bash
# Navigate to your project root
cd AgricFi-MVP

# Install all wallet adapter packages
npm install

# Or manually:
npm install @solana/web3.js \
  @solana/wallet-adapter-base \
  @solana/wallet-adapter-phantom \
  @solana/wallet-adapter-solflare \
  @solana/wallet-adapter-backpack \
  @solana/wallet-adapter-glow \
  @solana/wallet-adapter-walletconnect
```

**Status:**
- [ ] Dependencies installed successfully
- [ ] No errors in console

---

## 📄 File Updates

### Step 2: Update index.html

**Location:** Bottom of file, before `</body>`

```html
<!-- Add these script imports -->
<script src="https://cdn.jsdelivr.net/npm/@solana/web3.js@1.91.1/lib/index.iife.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@solana/wallet-adapter-base@0.9.23/lib/index.iife.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@solana/wallet-adapter-phantom@0.9.24/lib/index.iife.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@solana/wallet-adapter-solflare@0.6.8/lib/index.iife.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@solana/wallet-adapter-backpack@0.1.3/lib/index.iise.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@solana/wallet-adapter-glow@0.2.1/lib/index.iise.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@solana/wallet-adapter-walletconnect@0.1.7/lib/index.iise.js"></script>

<script src="wallet-adapter.js"></script>
<script src="wallet.js"></script>
<script src="data.js"></script>

<script>
  document.addEventListener('DOMContentLoaded', async () => {
    await initWallet();
  });
</script>
```

**Status:**
- [ ] Scripts added to index.html
- [ ] Scripts load without 404 errors
- [ ] initWallet() is called on page load

---

### Step 3: Update investor.html

**Same as Step 2** — Add identical script imports before `</body>`

**Status:**
- [ ] Scripts added to investor.html
- [ ] No console errors

---

### Step 4: Update farmer.html

**Same as Step 2** — Add identical script imports before `</body>`

**Status:**
- [ ] Scripts added to farmer.html
- [ ] No console errors

---

## 💻 Code Updates

### Step 5: Update confirmInvestment() Function

**File:** `wallet.js` (around line 457)

**Replace existing function with:**

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
    // Create Solana connection
    const connection = new solanaWeb3.Connection(
      'https://api.devnet.solana.com',
      'confirmed'
    );

    const userPublicKey = WalletManager.getPublicKey();
    const transaction = new solanaWeb3.Transaction();

    // Add your investment instruction here
    // For now, simple transfer instruction as placeholder
    transaction.add(
      solanaWeb3.SystemProgram.transfer({
        fromPubkey: userPublicKey,
        toPubkey: new solanaWeb3.PublicKey('11111111111111111111111111111111'),
        lamports: 1000,
      })
    );

    transaction.feePayer = userPublicKey;
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;

    // Sign transaction with wallet
    const signedTx = await WalletManager.signTransaction(transaction);
    
    if (!signedTx) {
      throw new Error('Transaction signing failed');
    }

    showToast('info', 'Broadcasting...', 'Sending transaction to blockchain');

    // Send to blockchain
    const txId = await connection.sendRawTransaction(
      signedTx.serialize(),
      { skipPreflight: true }
    );

    // Wait for confirmation
    await connection.confirmTransaction(txId, 'confirmed');

    // Success!
    closeInvestModal();
    showToast('success', 'Investment Confirmed!', `$${amt.toLocaleString()} invested in ${_investFarm.name}`);

    if (typeof refreshPortfolio === 'function') {
      refreshPortfolio();
    }

  } catch (error) {
    console.error('Investment failed:', error);
    
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

**Status:**
- [ ] Function updated with wallet signing
- [ ] Error handling added
- [ ] Tested in browser console (no syntax errors)

---

### Step 6: Add CSS Styles (Optional)

**File:** `style.css` — Add to end of file:

```css
/* Wallet Option Styles */
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

**Status:**
- [ ] CSS added to style.css
- [ ] Wallet UI looks improved

---

## 🧪 Testing Phase

### Desktop Testing

#### Test 1: Phantom Connection (Desktop)
- [ ] Open `index.html` in Chrome/Firefox
- [ ] Click "Connect Wallet" button
- [ ] Select "Phantom" from modal
- [ ] Phantom popup appears
- [ ] Click "Connect" in popup
- [ ] Wallet address shows in button
- [ ] Status: ✅ Connected

#### Test 2: Solflare Connection (Desktop)
- [ ] Click wallet button again
- [ ] Click "Disconnect"
- [ ] Click "Connect Wallet"
- [ ] Select "Solflare"
- [ ] Solflare popup appears
- [ ] Connection successful
- [ ] Status: ✅ Connected

#### Test 3: Backpack Connection (Desktop)
- [ ] Repeat with "Backpack" option
- [ ] Status: ✅ Connected

#### Test 4: Session Restore (Desktop)
- [ ] Connect to a wallet
- [ ] Refresh page
- [ ] Wallet should auto-reconnect silently
- [ ] Address still showing
- [ ] Status: ✅ Session restored

---

### Mobile Testing

#### Test 5: Mobile Phantom (iPhone/Android)
- [ ] Install Phantom mobile app
- [ ] Get your local IP: `ifconfig getifaddr en0` (Mac) or `ipconfig` (Windows)
- [ ] Open browser: `http://YOUR_IP:8000`
- [ ] Click "Connect Wallet"
- [ ] "Phantom" should show as recommended
- [ ] Click Phantom option
- [ ] App should deep-link to Phantom
- [ ] Sign in to Phantom
- [ ] Browser should return with connected wallet
- [ ] Status: ✅ Mobile deeplink works

#### Test 6: Mobile Solflare
- [ ] Install Solflare mobile app
- [ ] Repeat Test 5 with Solflare
- [ ] Status: ✅ Mobile deeplink works

#### Test 7: Mobile Without Wallet App
- [ ] Open on device without wallet installed
- [ ] Click "Connect Wallet"
- [ ] Should show install link
- [ ] Click wallet option → opens download page
- [ ] User can install from app store
- [ ] Status: ✅ Install flow works

---

### Investment Feature Testing

#### Test 8: Get Devnet SOL
```bash
# Option 1: CLI
solana airdrop 2 YOUR_WALLET_ADDRESS --url devnet

# Option 2: Discord
# Join AgricFi Discord → #get-test-sol → Post address → Bot sends SOL
```
- [ ] Wallet has SOL balance on devnet
- [ ] Check on: https://explorer.solana.com/?cluster=devnet

#### Test 9: Investment Flow (Desktop)
- [ ] Connected wallet with devnet SOL
- [ ] Click "Invest with SOL" button
- [ ] Investment modal opens
- [ ] Enter amount: 100
- [ ] Click "Confirm Investment"
- [ ] Wallet popup appears to sign
- [ ] Click "Approve" in wallet
- [ ] Toast shows "Broadcasting..."
- [ ] After confirmation, shows success message
- [ ] Transaction ID in toast (clickable)
- [ ] Status: ✅ Investment complete

#### Test 10: Investment Failed (No SOL)
- [ ] Use wallet without devnet SOL
- [ ] Try to invest
- [ ] Should show "Insufficient SOL" error
- [ ] Status: ✅ Error handling works

#### Test 11: User Rejects Signing
- [ ] Start investment
- [ ] Click "Reject" in wallet popup
- [ ] Should show "Rejected" message
- [ ] User can try again
- [ ] Status: ✅ Rejection handling works

---

## 🔍 Verification Checklist

### Browser Console
```javascript
// Run these commands in browser console to verify:

// 1. Check wallet manager exists
console.log(typeof WalletManager);  // Should be 'object'

// 2. Check connection status
console.log(WalletManager.isConnected());  // Should be true/false

// 3. Check detected wallets
console.log(WalletManager.detectWallets());  // Should show array

// 4. Check platform detection
console.log(WalletManager.isMobile());  // Should be true/false
console.log(WalletManager.isInApp());   // Should be true/false
```

**Status:**
- [ ] WalletManager is accessible
- [ ] All methods return expected values
- [ ] No errors in console

---

### Network Tab (DevTools)
- [ ] CDN scripts load successfully
  - [ ] `@solana/web3.js`
  - [ ] `wallet-adapter-*` packages
  - [ ] `wallet-adapter.js`
  - [ ] `wallet.js`

**Status:**
- [ ] All scripts load (200 status)
- [ ] No 404 errors

---

## 📊 Feature Comparison

| Feature | Old | New | Status |
|---------|-----|-----|--------|
| Desktop wallets | ✅ | ✅ | |
| Mobile wallets | ❌ | ✅ | [ ] Tested |
| Transaction signing | ❌ | ✅ | [ ] Tested |
| Message signing | ❌ | ✅ | [ ] Tested |
| Error handling | Basic | Comprehensive | [ ] Verified |
| Session restore | ✅ | ✅ (improved) | [ ] Tested |
| In-app browser | ❌ | ✅ | [ ] Tested |

---

## 🚀 Deployment Checklist

### Before Going Live
- [ ] All tests passed (desktop and mobile)
- [ ] No console errors
- [ ] Transaction signing works end-to-end
- [ ] Error messages are user-friendly
- [ ] Mobile deep-linking works
- [ ] Session persistence works
- [ ] CSS styles applied correctly

### Code Review
- [ ] No hardcoded addresses (use environment variables)
- [ ] Error messages don't leak sensitive info
- [ ] Transaction amounts validated
- [ ] Wallet disconnection handled properly
- [ ] Rate limiting considered for investments

### Security Check
- [ ] Using Devnet only (not mainnet)
- [ ] No private keys in code
- [ ] Message signing includes origin verification
- [ ] RPC endpoint is trusted (devnet.solana.com)
- [ ] Input validation on amounts

### Documentation
- [ ] README updated with setup instructions
- [ ] Team trained on new wallet system
- [ ] Support docs prepared for users
- [ ] FAQ updated

---

## 📈 Post-Launch Monitoring

### Monitor These Metrics
- [ ] Connection success rate
- [ ] Investment transaction success rate
- [ ] Error rate by type
- [ ] Mobile vs desktop usage split
- [ ] Wallet distribution (Phantom vs Solflare vs others)

### Common Issues to Watch
- [ ] RPC rate limits
- [ ] Failed transactions
- [ ] Wallet connection timeouts
- [ ] Mobile deep-linking failures
- [ ] Session restore issues

---

## 🔧 Troubleshooting Guide

### Issue: "Wallet not found"
**Solution:**
```javascript
// Check in console:
console.log(WalletManager.detectWallets());
// Should show installed wallets
```

### Issue: Mobile wallet doesn't open
**Solution:**
- Make sure wallet app is installed
- Check URL formatting in `wallet-adapter.js`
- Test on actual device (not emulator)

### Issue: Transaction signing fails
**Solution:**
```javascript
try {
  const signed = await WalletManager.signTransaction(tx);
  console.log('Signed:', signed);
} catch(e) {
  console.error('Signing error:', e.message);
}
```

### Issue: Session doesn't restore
**Solution:**
- Check localStorage: `localStorage.getItem('agricfi_wallet')`
- Verify wallet still installed
- Try manual reconnect

### Issue: Investment button disabled
**Solution:**
- Check wallet connection: `WalletManager.isConnected()`
- Check devnet SOL balance on https://explorer.solana.com

---

## ✅ Sign-Off

Once all tests pass:

- [ ] Development testing complete
- [ ] Staging environment testing complete
- [ ] Security review passed
- [ ] Team approval obtained
- [ ] Ready for production deployment

**Deployed by:** ________________  
**Date:** ________________  
**Notes:** _______________________________________________________________

---

## 📞 Support Resources

- **Documentation**: See `WALLET_SETUP.md` and `HTML_INTEGRATION_GUIDE.md`
- **Code Reference**: Check `wallet-adapter.js` comments
- **Solana Docs**: https://github.com/solana-labs/wallet-adapter
- **Discord**: #wallet-support channel
- **Issues**: GitHub Issues in AgricFi-MVP repo

---

**Good luck! 🚀 You've got this!**

If you encounter any issues, refer back to the relevant section or check the support resources above.
