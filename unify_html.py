import re
import os

def process_file(filename):
    with open(filename, 'r') as f:
        content = f.read()

    # 1. Remove the large inline script block that starts with "// ── WALLET SYSTEM"
    # or look for the </script> before </body>

    # Find the last <script> tag before </body>
    pattern = re.compile(r'<script>\s*// ── WALLET SYSTEM.*?</script>', re.DOTALL)
    if pattern.search(content):
        print(f"Found inline wallet logic in {filename}, replacing...")
        new_content = pattern.sub('<script src="wallet.js"></script>', content)
    else:
        # If not found, just insert it before </body>
        print(f"Inline logic not found in {filename}, appending script tag...")
        new_content = content.replace('</body>', '<script src="wallet.js"></script>\n</body>')

    with open(filename, 'w') as f:
        f.write(new_content)

process_file('index.html')
process_file('farmer.html')
process_file('investor.html')
