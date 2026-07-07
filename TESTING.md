# Testing Brisk on your iPhone 📱

You do **not** need to publish anything to the App Store. Your phone runs the app
live while your computer feeds it the code over Wi‑Fi. Setup is ~10 minutes the
first time, then ~20 seconds every time after.

> **How it works (the mental model):** Your computer runs a little local server
> (called *Metro*). The free **Expo Go** app on your iPhone connects to it and
> shows your app. Save a file → the app updates instantly. Nothing is installed
> permanently on your phone.

**Your computer and your iPhone must be on the same Wi‑Fi network.**

---

## ✅ One-time setup

### Step 1 — Install the Expo Go app on your iPhone
Open the App Store, search **“Expo Go”**, install it. (Free.) Open it once and
create a free account, or just skip sign-in.

### Step 2 — Install Node on your computer
Node is the engine that runs the project.

**On a Mac:**
1. Open the **Terminal** app (press `Cmd` + `Space`, type "Terminal", hit Enter).
2. Go to <https://nodejs.org> and download the **LTS** version, run the installer.
3. Back in Terminal, check it worked:
   ```bash
   node --version
   ```
   You should see something like `v22.x.x`.

**On Windows:**
1. Go to <https://nodejs.org>, download the **LTS** installer, run it (click Next
   through the defaults).
2. Open the **PowerShell** app (Start menu → type "PowerShell").
3. Check it worked:
   ```powershell
   node --version
   ```

### Step 3 — Get the code onto your computer
The code lives on GitHub on the branch `claude/priority-email-app-ios-hog94s`.

**Easiest (no Git needed):**
1. Open the pull request on GitHub.
2. Click the green **`< > Code`** button → **Download ZIP**.
3. Unzip it. You'll get a folder like `fyxer-email-assistant`.

**Or, if you have Git installed:**
```bash
git clone https://github.com/cameron-scale/fyxer-email-assistant.git
cd fyxer-email-assistant
git checkout claude/priority-email-app-ios-hog94s
```

---

## ▶️ Running it (every time)

1. Open Terminal (Mac) or PowerShell (Windows).
2. Move into the project folder. Tip: type `cd ` (with a space) then **drag the
   folder onto the window** and press Enter. It'll look like:
   ```bash
   cd /Users/cameron/Downloads/fyxer-email-assistant
   ```
3. The first time only, install the building blocks (takes a couple of minutes):
   ```bash
   npm install
   ```
4. Start it:
   ```bash
   npm start
   ```
5. A big **QR code** appears in the window. On your iPhone, open the **Camera**
   app and point it at the QR code, then tap the yellow banner that pops up. Brisk
   opens in Expo Go. 🎉

It opens with demo emails, so you can immediately try swiping cards, the **Zip**
deck, VIP stars, and the reply tones — no email login required.

To stop the server, click the terminal window and press `Ctrl` + `C`.

---

## 🆘 If something goes wrong

- **QR code won't connect / "Network response timed out":** Your phone and computer
  must be on the **same Wi‑Fi**. On some networks devices can't see each other; if
  so, run `npm start` then press `s`… or simplest, run:
  ```bash
  npx expo start --tunnel
  ```
  This routes through the internet instead of local Wi‑Fi (a little slower, but it
  works almost anywhere). Scan the new QR code.
- **`npm` or `node` "not recognized":** Node didn't install or the window was open
  before installing — close it, open a fresh one, try again.
- **Red error screen in the app:** Shake the phone → **Reload**. If it persists,
  stop the server (`Ctrl` + `C`) and run `npm start` again.
- **"command not found: expo":** That's fine — always use `npm start`, not `expo`
  directly.

---

## 🌐 Zero-install alternative (test from a browser)

If you don't want to install Node at all, you can try it via **Expo Snack**:
1. Go to <https://snack.expo.dev>.
2. Use **Import → from GitHub** and paste the repo URL.
3. On the right, choose **My Device**, then scan the QR with **Expo Go**.

(Snack is great for a quick look; running locally with `npm start` is smoother for
real testing.)
