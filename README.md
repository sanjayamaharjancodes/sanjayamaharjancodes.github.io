# Portfolio — Sanjaya Maharjan

Static one-page portfolio. Ready for **GitHub Pages**.

## Upload to a new GitHub repo

1. **Create a new repo** on GitHub (e.g. `my-portfolio`). Do not add a README or .gitignore (this folder has everything).

2. **Upload this folder** as the repo root:
   - Either push this folder’s contents as the initial commit:
     ```bash
     cd portfolio-package   # or whatever you named the folder
     git init
     git add .
     git commit -m "Initial commit: portfolio"
     git branch -M main
     git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
     git push -u origin main
     ```
   - Or drag-and-drop the contents into GitHub’s “upload an existing repository” flow.

3. **Turn on GitHub Pages**
   - Repo → **Settings** → **Pages**
   - **Source:** Deploy from a branch
   - **Branch:** `main` (or `master`), folder **/ (root)** → Save

4. **Your site:** `https://YOUR_USERNAME.github.io/YOUR_REPO/`

## Contents

- `index.html` — single-page layout
- `styles.css` — theme and layout
- `script.js` — theme toggle, nav, sidebar border
- `assets/` — images and CV (e.g. `profile.png`, `cv.pdf`)

No build step. GitHub Pages serves the files as-is.
