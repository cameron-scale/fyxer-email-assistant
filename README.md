# Brisk 📨⚡

A fun, fast **priority inbox** for your phone — built to replace the Outlook app.
Brisk reads your email, figures out what actually matters, sorts it by priority,
and lets you **zip through the pile** with simple swipes.

It runs on **Expo Go**, so you can test it on your iPhone in about 2 minutes with
no App Store, no Xcode, and no Mac required.

---

## ✨ What it does

- **Reads & parses every email** and sorts it into four buckets:
  🔴 **Urgent** · 🟠 **Important** · 🟢 **FYI** · ⚪ **Noise** (promos/newsletters)
- **Tells you _why_** each email was ranked ("Asks a question", "From a real person",
  "Looks automated").
- **Zip-through mode** — a swipe deck (like dating apps, but for your inbox):
  - 👉 swipe **right** = Done
  - 👈 swipe **left** = Archive
  - 👆 swipe **up** = Snooze 4h
- **One-line TL;DR** for every email so you don't have to open them.
- **One-tap reply drafts** that adapt to the email (Approve, Suggest a time, etc.).
- **Demo mode** with realistic sample emails so it's fun the instant you open it.
- Sign in with **Gmail** and **Outlook**. (iCloud — see note below.)

---

## 🚀 Try it on your iPhone (2 minutes)

1. Install the **Expo Go** app from the iOS App Store.
2. On your computer, in this folder, run:
   ```bash
   npm install
   npm start
   ```
3. A **QR code** appears in the terminal. Open the iPhone **Camera** app and point
   it at the QR code, then tap the banner to open it in Expo Go.
4. Brisk opens with demo emails. Tap **"Zip through them"** and start swiping. 🎉

> First time only: `npm install` downloads the building blocks. It can take a
> couple of minutes — that's normal.

---

## 🔑 Turn on real logins (optional)

Demo mode needs zero setup. To pull in your **real** email, you paste one free ID
per provider into **one file**: `src/auth/authConfig.js`.

### Gmail
1. Go to <https://console.cloud.google.com/> → create a project.
2. **APIs & Services → Library →** enable **Gmail API**.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
4. Copy the **Client ID** and paste it into `GOOGLE_CLIENT_ID` in
   `src/auth/authConfig.js`.

### Outlook / Microsoft 365
1. Go to <https://portal.azure.com/> → **App registrations → New registration**.
2. Choose **"Accounts in any organizational directory and personal Microsoft
   accounts"** and register it as a **public/mobile client**.
3. Copy the **Application (client) ID** and paste it into `MICROSOFT_CLIENT_ID`.

That's it — restart `npm start`, open **Connect your email**, and sign in.

> 💡 Real OAuth logins work most reliably in a **development build** of the app
> rather than plain Expo Go (Google restricts some logins inside Expo Go). The code
> is ready for both. If a real login won't complete in Expo Go, that's expected —
> demo mode shows the full experience in the meantime.

---

## 🍏 Why iCloud is different

Apple does **not** offer a "Sign in with iCloud for email" button the way Google and
Microsoft do. iCloud Mail can only be read over **IMAP** using an **app-specific
password**. A phone app can't safely open a raw IMAP connection by itself, so iCloud
needs a tiny **server** in the middle (a "proxy") to fetch the mail and hand it to
the app.

The app shows iCloud in the Connect screen and explains this. When you're ready, the
clean path is a small serverless function (e.g. a single Cloud function) that logs in
over IMAP with your app-specific password and returns messages in the same shape the
app already uses — then iCloud lights up just like Gmail and Outlook.

---

## 🗂️ How the code is organized (for the curious)

```
App.js                     # Entry point + a tiny screen navigator
src/
  theme.js                 # All colors / sizes in one place
  store.js                 # Shared app state (the inbox + actions)
  data/demoEmails.js       # Sample inbox used in demo mode
  lib/
    priority.js            # ⭐ The "brain": reads & ranks each email
    drafts.js              # Generates quick reply suggestions
    storage.js             # Encrypted token storage
    time.js                # "3m", "2h", "Yesterday" labels
  api/
    gmail.js               # Fetch + tidy Gmail messages
    outlook.js             # Fetch + tidy Outlook messages
  auth/
    authConfig.js          # 👈 paste your Client IDs here
    useProviders.js        # The Google/Microsoft sign-in flows
  components/              # Reusable UI bits (cards, pills, avatars, buttons)
  screens/                 # Inbox, Triage (swipe deck), Detail, Connect
```

**Want to teach Brisk about your world?** Open `src/lib/priority.js` and edit the
word lists at the top (e.g. add your boss's name or your project codewords to make
those emails rank higher). The change takes effect instantly.

---

## 🔒 Privacy

Brisk only ever requests **read** access to your mail, stores access tokens in your
phone's **encrypted keychain**, and does all sorting **on your device** — no email
content is sent to any third-party server.

---

## 🛠️ Built with

Expo (React Native) · expo-auth-session · expo-secure-store · expo-linear-gradient.
No paid services required.
