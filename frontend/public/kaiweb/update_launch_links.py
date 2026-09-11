import os

html_files = [
    'bizcanvas.html', 'DAO.html', 'ecosystem.html', 'index.html',
    'insurance.html', 'pension.html', 'problems.html', 'products.html',
    'solution.html', 'trust.html'
]

for f in html_files:
    if not os.path.exists(f):
        continue
        
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
        
    # Replace the Launch App links
    new_content = content.replace('href="https://kai.bar" class="cta-btn"', 'href="https://kainuv-app-9v3m.vercel.app/" class="cta-btn"')
    new_content = new_content.replace('href="https://kai.bar">Launch App</a>', 'href="https://kainuv-app-9v3m.vercel.app/">Launch App</a>')
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(new_content)

print("Launch App links updated.")
