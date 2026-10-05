# IP + Battery Tracker

A deliberately small standalone Node.js + Express app with two public pages:

- `/` — records the visitor IP, browser battery percentage when available, and UTC timestamp.
- `/data` — publicly displays the collected records in a simple table.

No redirects, login, password, authentication, charts, analytics, or database service are included.

## What is collected

Only:

- IP address
- Battery percentage (`0–100`) or `Unknown`
- Timestamp

The browser does **not** expose GPS location, ISP, browsing history, device model, or screen contents to this app.

### Battery behavior

The `/` page checks for `navigator.getBattery()`. If supported, it converts the browser's `0–1` level to a rounded percentage. If unsupported or unavailable, it sends `null`, which is displayed as `Unknown`.

Battery Status API support is limited and may be unavailable in many browsers.

### Tab closing

After a successful recording, the page calls `window.close()`.

A browser may refuse to close a tab that the user opened normally. JavaScript cannot reliably force-close such a tab. The app therefore only makes a best-effort close attempt.

## Run locally — Windows CMD

Open CMD and run:

```cmd
mkdir ip-battery-tracker
cd ip-battery-tracker
```

If you created the files manually, then install dependencies:

```cmd
npm install
```

Start the server:

```cmd
npm start
```

Open these in a browser:

```text
http://localhost:3000/
http://localhost:3000/data
```

For a quick API check from another CMD window:

```cmd
curl http://localhost:3000/data
```

Then visit `/` in a normal browser tab. If the browser supports the Battery Status API, a battery value may be recorded; otherwise it will be `Unknown`.

## GitHub — Windows CMD

From the project directory:

```cmd
git init
git add .
git commit -m "Initial commit"
git branch -M main
```

Create an empty GitHub repository, then replace the placeholder URL below with your repository URL:

```cmd
git remote add origin https://github.com/YOUR-USERNAME/ip-battery-tracker.git
git push -u origin main
```

If GitHub asks you to authenticate, use GitHub's supported authentication method for your account.

## Render deployment

Render supports Node.js web services and recommends using the `PORT` environment variable; the app also binds to `0.0.0.0`. See the Render docs for web services and deployment configuration.

In Render:

1. Create **New → Web Service**.
2. Connect your GitHub repository.
3. Runtime/language: **Node**.
4. Build Command:
   ```text
   npm install
   ```
5. Start Command:
   ```text
   npm start
   ```
6. Deploy.

Your app will receive an `onrender.com` URL. The two pages are:

```text
https://YOUR-APP.onrender.com/
https://YOUR-APP.onrender.com/data
```

## Important: JSON persistence on Render

The app intentionally uses:

```text
data/visits.json
```

Render web services have an ephemeral filesystem by default. Changes to ordinary local files can be lost on restarts, redeploys, or (on the Free plan) spin-downs.

For this exact JSON design, the simplest persistent option is a **paid Render Web Service with a persistent disk** mounted at:

```text
/opt/render/project/src/data
```

Because the app writes to `data/visits.json`, mounting the `data` directory there means the JSON file is under the persistent disk.

In Render, add a persistent disk to the web service:

- Mount path: `/opt/render/project/src/data`
- Smallest disk size that fits your needs

Only files under that mount path are persisted. Render documents that persistent disks are available for paid web services and that attaching one prevents zero-downtime deploys.

If you need persistence on Render's Free plan, this JSON-file approach is not reliable. Render currently recommends a managed datastore such as Postgres for persistent relational data, but that would make this project less lightweight.

## Privacy note

`/data` intentionally exposes the collected IP addresses to anyone who can visit that URL. IP addresses can be personal data. Only deploy this as configured if you have a legitimate reason and appropriate notice/consent for the people being recorded.

## Project structure

```text
ip-battery-tracker/
├── data/
│   └── visits.json
├── public/
│   └── track.html
├── .env.example
├── .gitignore
├── package.json
├── server.js
└── README.md
```
