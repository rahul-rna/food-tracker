# Food Tracker — Firebase Setup Guide

Follow these steps to get your Food Tracker syncing across all your devices.

---

## Step 1: Create a Firebase Project (2 minutes)

1. Go to [https://console.firebase.google.com](https://console.firebase.google.com)
2. Click **"Create a project"** (or "Add project")
3. Name it **food-tracker** (or anything you like)
4. Disable Google Analytics (you don't need it) → Click **Create Project**
5. Wait for it to finish, then click **Continue**

## Step 2: Create the Firestore Database

1. In the left sidebar, click **"Build"** → **"Firestore Database"**
2. Click **"Create database"**
3. Choose a location closest to you (e.g., `us-central1` for US)
4. Select **"Start in test mode"** → Click **Next** → Click **Create**

> **Important:** Test mode allows open read/write for 30 days. We'll add proper security rules below.

## Step 3: Get Your Firebase Config

1. In the Firebase console, click the **gear icon** (top left) → **"Project settings"**
2. Scroll down to **"Your apps"** section
3. Click the **web icon** (`</>`) to add a web app
4. Nickname it **food-tracker-web** → Click **"Register app"**
5. You'll see a code block with `firebaseConfig`. Copy the values.
6. Open `firebase-config.js` in the calories folder and replace the placeholder values:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",              // ← your actual key
  authDomain: "food-tracker-xxxxx.firebaseapp.com",
  projectId: "food-tracker-xxxxx",
  storageBucket: "food-tracker-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

7. Save the file.

## Step 4: Set Up Security Rules (recommended)

Go back to **Firestore Database** → **Rules** tab, and replace the default rules with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

> This keeps it open (no login required). Since only you know the URL, this is fine for personal use. If you want login-based security later, let me know and I can add Firebase Auth.

Click **Publish**.

## Step 5: Deploy to GitHub Pages

### First time setup:

1. Install GitHub CLI (if you haven't already):
   ```bash
   brew install gh
   ```

2. Create a GitHub account at [https://github.com](https://github.com) if you don't have one.

3. Log in:
   ```bash
   gh auth login
   ```
   Follow the prompts (choose "Login with a web browser").

4. From the project folder, run:
   ```bash
   cd /Users/rahulraghavan/Documents/random/calories
   git add -A
   git commit -m "Add Firebase sync and PWA support"
   gh repo create food-tracker --public --source=. --push
   ```

5. Enable GitHub Pages:
   ```bash
   gh api repos/{owner}/food-tracker/pages -X POST -f source.branch=master -f source.path=/
   ```

6. Wait 1-2 minutes, then your app is live at:
   ```
   https://YOUR_GITHUB_USERNAME.github.io/food-tracker
   ```

### Updating the app later:
```bash
cd /Users/rahulraghavan/Documents/random/calories
git add -A
git commit -m "Update"
git push
```
Changes go live in about 1 minute.

## Step 6: Add to Phone Home Screen

### iPhone:
1. Open the URL in Safari
2. Tap the **Share** button (square with arrow)
3. Tap **"Add to Home Screen"**
4. Tap **Add**

### Android:
1. Open the URL in Chrome
2. Tap the **three-dot menu**
3. Tap **"Add to Home screen"** or **"Install app"**
4. Tap **Add**

---

## How It Works

- **Data syncs in real-time** via Firebase Firestore
- Log food on your phone → it appears on your Mac instantly (and vice versa)
- **Works offline** too — entries save locally and sync when you're back online
- The header shows sync status: `● Synced`, `◌ Syncing…`, `○ Local only`, or `✕ Sync error`

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Shows "Local only" | Check that `firebase-config.js` has your real config values |
| Shows "Sync error" | Check browser console for errors; verify Firestore rules allow read/write |
| Old data not synced | Existing localStorage data won't auto-upload. Enter a test item to verify sync works |
| Icons missing | The purple circle icons are generated. Replace `icon-192.png` and `icon-512.png` with custom icons if desired |
