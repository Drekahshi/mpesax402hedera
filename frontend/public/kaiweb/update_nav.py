import os
import re

html_files = [
    'bizcanvas.html', 'DAO.html', 'ecosystem.html', 'index.html',
    'insurance.html', 'pension.html', 'problems.html', 'products.html',
    'solution.html', 'trust.html'
]

nav_template = """        <ul class="nav-links">
            <li><a href="problems.html"{problems_active}>Problem</a></li>
            <li><a href="solution.html"{solution_active}>Solution</a></li>
            <li class="dropdown">
                <a href="products.html"{products_active}>Kai Products ▾</a>
                <div class="dropdown-content">
                    <a href="insurance.html"{insurance_active}>Insurance</a>
                    <a href="pension.html"{pension_active}>Pension</a>
                    <a href="trust.html"{trust_active}>Trust</a>
                    <a href="ecosystem.html"{ecosystem_active}>Ecosystem</a>
                </div>
            </li>
            <li><a href="DAO.html"{dao_active}>DAO</a></li>
            <li><a href="bizcanvas.html"{bizcanvas_active}>Business Canvas</a></li>
        </ul>"""

def get_active_str(file_name, target):
    if file_name == target:
        return ' class="active"'
    return ''

for f in html_files:
    if not os.path.exists(f):
        continue
        
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
        
    nav = nav_template.format(
        problems_active=get_active_str(f, 'problems.html'),
        solution_active=get_active_str(f, 'solution.html'),
        products_active=get_active_str(f, 'products.html'),
        insurance_active=get_active_str(f, 'insurance.html'),
        pension_active=get_active_str(f, 'pension.html'),
        trust_active=get_active_str(f, 'trust.html'),
        ecosystem_active=get_active_str(f, 'ecosystem.html'),
        dao_active=get_active_str(f, 'DAO.html'),
        bizcanvas_active=get_active_str(f, 'bizcanvas.html')
    )
    
    # Replace the existing ul nav-links block using regex
    pattern = re.compile(r'<ul class="nav-links">.*?</ul>', re.DOTALL)
    new_content = pattern.sub(nav, content)
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(new_content)

print("Nav links updated.")

# Append CSS to styles.css
css_file = os.path.join('css', 'styles.css')
if os.path.exists(css_file):
    with open(css_file, 'r', encoding='utf-8') as file:
        css_content = file.read()
    
    if '/* Dropdown Menu */' not in css_content:
        dropdown_css = """
/* ----------------------------------------
   19. DROPDOWN MENU
   ---------------------------------------- */
.dropdown {
    position: relative;
    display: inline-block;
}

.dropdown-content {
    display: none;
    position: absolute;
    background-color: var(--bg-card);
    min-width: 160px;
    box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.5);
    z-index: 1000;
    border: 1px solid var(--border);
    border-radius: 4px;
    top: 100%;
    left: 0;
    padding: 8px 0;
}

.dropdown-content a {
    color: var(--paper-dim) !important;
    padding: 8px 16px;
    text-decoration: none;
    display: block;
    text-transform: none !important;
    font-size: 14px !important;
    font-weight: 400 !important;
    letter-spacing: normal !important;
}

.dropdown-content a:hover {
    background-color: var(--bg-card-hover);
    color: var(--gold-light) !important;
}

.dropdown:hover .dropdown-content,
.dropdown:focus-within .dropdown-content {
    display: block;
}

@media (max-width: 768px) {
    .dropdown-content {
        position: static;
        display: none;
        box-shadow: none;
        border: none;
        border-left: 2px solid var(--border);
        margin-left: 16px;
        background-color: transparent;
        padding: 0;
        margin-top: 8px;
    }
    .dropdown-content a {
        padding: 8px 12px;
    }
    .dropdown:hover .dropdown-content,
    .dropdown:active .dropdown-content,
    .dropdown:focus-within .dropdown-content {
        display: block;
    }
}
"""
        with open(css_file, 'a', encoding='utf-8') as file:
            file.write(dropdown_css)
        print("Dropdown CSS added.")
    else:
        print("Dropdown CSS already exists.")
