# Photo uploader

A local website that saves uploaded photos to `./images`, then runs
`git add`, `git commit`, and `git push` for you.

## One-time setup

1. Install Node.js (v18+) from https://nodejs.org
2. Put this folder in a GitHub repo:
   ```
   cd photo-uploader
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
   git push -u origin main
   ```
   (Create the empty repo on GitHub first. Make sure `git push` works from the
   terminal without asking for a password, e.g. via GitHub CLI `gh auth login`
   or a saved credential/SSH key.)
3. Install dependencies:
   ```
   npm install
   ```

## Run

```
npm start
```
Open http://localhost:43655

## Options

- Commit only, no push: `AUTO_PUSH=false npm start` (Windows PowerShell: `$env:AUTO_PUSH="false"; npm start`)
- Different port: `PORT=4000 npm start`

## Naming photos

Each photo gets a name field before upload. Type the name you want (for example
`abc` for a photo called `xyz.jpg`) and it is saved as `abc.jpg`. The page warns
you if that name is already used in `images/`, and the server checks again and
refuses to overwrite anything. Spaces and symbols in a name become hyphens.
