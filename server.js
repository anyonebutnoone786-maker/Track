const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data", "visits.json");

app.set("trust proxy", 1);

app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

let writeQueue = Promise.resolve();

async function ensureDataFile() {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });

  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, "[]\n", "utf8");
  }
}

async function readVisits() {
  await ensureDataFile();

  const raw = await fs.readFile(DATA_FILE, "utf8");

  try {
    const visits = JSON.parse(raw);
    return Array.isArray(visits) ? visits : [];
  } catch {
    return [];
  }
}

function queueWrite(work) {
  const next = writeQueue.then(work);
  writeQueue = next.catch(() => {});
  return next;
}

function validBattery(value) {
  return Number.isInteger(value) && value >= 0 && value <= 100;
}

function cleanString(value, maxLength = 500) {
  if (typeof value !== "string") return null;
  return value.slice(0, maxLength);
}

/*
 * IP-based approximate location.
 *
 * This uses ipapi.co from the server side. It does NOT request
 * the visitor's GPS location.
 */
async function getApproximateLocation(ip) {
  try {
    // Local/private IPs don't have useful public geolocation.
    if (
      !ip ||
      ip === "::1" ||
      ip === "127.0.0.1" ||
      ip.startsWith("10.") ||
      ip.startsWith("192.168.") ||
      ip.startsWith("172.16.")
    ) {
      return {
        country: null,
        region: null,
        city: null
      };
    }

    const response = await fetch(
      `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
      {
        headers: {
          "User-Agent": "VisitorTracker/1.0"
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Location lookup failed: ${response.status}`);
    }

    const data = await response.json();

    return {
      country: cleanString(data.country_name, 100),
      region: cleanString(data.region, 100),
      city: cleanString(data.city, 100)
    };
  } catch (error) {
    console.error("Location lookup failed:", error);

    return {
      country: null,
      region: null,
      city: null
    };
  }
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "track.html"));
});

app.post("/api/record", async (req, res) => {
  const body = req.body || {};

  const battery = validBattery(body.battery)
    ? body.battery
    : null;

  const device = {
    type: cleanString(body.device?.type, 50),
    browser: cleanString(body.device?.browser, 100),
    os: cleanString(body.device?.os, 100),
    userAgent: cleanString(body.device?.userAgent, 1000)
  };

  const screen = {
    width: Number.isInteger(body.screen?.width)
      ? body.screen.width
      : null,

    height: Number.isInteger(body.screen?.height)
      ? body.screen.height
      : null,

    availWidth: Number.isInteger(body.screen?.availWidth)
      ? body.screen.availWidth
      : null,

    availHeight: Number.isInteger(body.screen?.availHeight)
      ? body.screen.availHeight
      : null,

    viewportWidth: Number.isInteger(body.screen?.viewportWidth)
      ? body.screen.viewportWidth
      : null,

    viewportHeight: Number.isInteger(body.screen?.viewportHeight)
      ? body.screen.viewportHeight
      : null,

    pixelRatio:
      typeof body.screen?.pixelRatio === "number" &&
      Number.isFinite(body.screen.pixelRatio)
        ? body.screen.pixelRatio
        : null,

    colorDepth: Number.isInteger(body.screen?.colorDepth)
      ? body.screen.colorDepth
      : null
  };

  const ip = req.ip;
  const location = await getApproximateLocation(ip);

  const visit = {
    ip,
    battery,
    device,
    screen,
    location,
    time: new Date().toISOString()
  };

  try {
    await queueWrite(async () => {
      const visits = await readVisits();

      visits.push(visit);

      await fs.writeFile(
        DATA_FILE,
        JSON.stringify(visits, null, 2) + "\n",
        "utf8"
      );
    });

    res.status(201).json({ ok: true });
  } catch (error) {
    console.error("Failed to save visit:", error);
    res.status(500).json({ ok: false });
  }
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatBattery(value) {
  return value === null ? "Unknown" : `${value}%`;
}

function formatScreen(screen) {
  if (!screen) return "Unknown";

  const resolution =
    screen.width && screen.height
      ? `${screen.width} × ${screen.height}`
      : "Unknown";

  const viewport =
    screen.viewportWidth && screen.viewportHeight
      ? `${screen.viewportWidth} × ${screen.viewportHeight}`
      : "Unknown";

  return `
    <strong>Screen:</strong> ${escapeHtml(resolution)}<br>
    <strong>Viewport:</strong> ${escapeHtml(viewport)}<br>
    <strong>Pixel ratio:</strong> ${escapeHtml(screen.pixelRatio ?? "Unknown")}
  `;
}

function formatDevice(device) {
  if (!device) return "Unknown";

  return `
    <strong>Type:</strong> ${escapeHtml(device.type || "Unknown")}<br>
    <strong>Browser:</strong> ${escapeHtml(device.browser || "Unknown")}<br>
    <strong>OS:</strong> ${escapeHtml(device.os || "Unknown")}
  `;
}

function formatLocation(location) {
  if (!location) return "Unknown";

  const parts = [
    location.city,
    location.region,
    location.country
  ].filter(Boolean);

  return parts.length
    ? escapeHtml(parts.join(", "))
    : "Unknown";
}

function renderDataPage(visits) {
  const rows = visits
    .slice()
    .reverse()
    .map((visit) => `
      <tr>
        <td>${escapeHtml(visit.time)}</td>

        <td>
          ${escapeHtml(visit.ip)}
        </td>

        <td>
          ${escapeHtml(formatLocation(visit.location))}
        </td>

        <td>
          ${formatDevice(visit.device)}
        </td>

        <td>
          ${formatScreen(visit.screen)}
        </td>

        <td>
          ${escapeHtml(formatBattery(visit.battery))}
        </td>
      </tr>
    `)
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">

  <title>Visitor Data</title>

  <style>
    body {
      margin: 0;
      padding: 2rem;
      font-family: Arial, sans-serif;
      color: #222;
      background: #f7f7f7;
    }

    h1 {
      margin-top: 0;
    }

    .wrap {
      overflow-x: auto;
      background: white;
      border-radius: 10px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.08);
    }

    table {
      width: 100%;
      min-width: 1100px;
      border-collapse: collapse;
    }

    th,
    td {
      text-align: left;
      vertical-align: top;
      padding: 0.8rem;
      border-bottom: 1px solid #ddd;
    }

    th {
      background: #f0f0f0;
      white-space: nowrap;
    }

    tr:last-child td {
      border-bottom: none;
    }
  </style>
</head>

<body>

  <h1>Visitor Data</h1>

  <div class="wrap">
    <table>
      <thead>
        <tr>
          <th>Timestamp</th>
          <th>IP Address</th>
          <th>Approx. Location</th>
          <th>Device</th>
          <th>Screen</th>
          <th>Battery</th>
        </tr>
      </thead>

      <tbody>
        ${
          rows ||
          '<tr><td colspan="6">No records yet.</td></tr>'
        }
      </tbody>
    </table>
  </div>

</body>
</html>`;
}

app.get("/data", async (req, res) => {
  try {
    const visits = await readVisits();

    res
      .type("html")
      .send(renderDataPage(visits));
  } catch (error) {
    console.error("Failed to read visits:", error);

    res
      .status(500)
      .type("text")
      .send("Could not load visitor data.");
  }
});

ensureDataFile()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(
        `Server listening on port ${PORT}`
      );
    });
  })
  .catch((error) => {
    console.error("Startup failed:", error);
    process.exit(1);
  });