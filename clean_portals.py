import re
import os

def clean_file(filename):
    with open(filename, 'r') as f:
        content = f.read()

    # 1. Remove the old inline script block
    # It usually starts with // ── WALLET SYSTEM and ends before </script>
    cleaned = re.sub(r'// ── WALLET SYSTEM.*?(?=</script>)', '', content, flags=re.DOTALL)

    # 2. Check if wallet.js is already linked
    if 'src="wallet.js"' not in cleaned:
        # Insert before </body>
        cleaned = cleaned.replace('</body>', '<script src="wallet.js"></script>\n</body>')

    # 3. Double check for duplicates
    # If there are multiple script tags for wallet.js, keep only one.
    # (Simplified: just check if it's there once)

    with open(filename, 'w') as f:
        f.write(cleaned)
    print(f"Cleaned {filename}")

clean_file('index.html')
clean_file('farmer.html')
clean_file('investor.html')
