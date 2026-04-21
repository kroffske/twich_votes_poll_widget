# Twitch Poll Scale Overlay

Real-time **Twitch Poll** and **Channel Points battle** visualization for OBS using animated scales, bars, or ranked lists.

```
Twitch EventSub WebSocket → Node.js Backend → WebSocket → OBS Browser Source
```

## Screenshot

> 📸 **Add scale visualization screenshot here** (`public/assets/scale-demo.png`)

## Quick Start

### 1. Install Node.js

**Node.js 20+** is required (comes with npm).

**Windows:**
1. Download and install [Node.js LTS](https://nodejs.org/)
2. Ensure "Add to PATH" is checked during installation
3. Restart your terminal
4. Verify:
   ```powershell
   node -v
   npm -v
   ```

**macOS / Linux:**
```bash
node -v
npm -v
```

### 2. Run Demo

```bash
npm run demo
```

This command:
- Creates `.env` with a random `OVERLAY_TOKEN`
- Installs dependencies (if needed)
- Starts the backend
- Opens admin panel in your browser

You'll see URLs like:
```
Admin:    http://localhost:3030/admin?token=...
OBS URL:  http://localhost:3030/overlay?token=...&mode=scale&metric=votes
```

Copy the OBS URL and add a **Browser Source** in OBS:
- Size: 1280×720
- Enable: "Refresh when visible" + "Shutdown when not visible"

## Twitch Setup

### Get Twitch Developer App

1. Go to [Twitch Developer Console](https://dev.twitch.tv/console)
2. Create an application
3. Set **OAuth Redirect URL**: `http://localhost:3030/auth/callback`
4. Copy **Client ID** and **Client Secret**

### Configure

Edit `.env`:
```env
TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret
TWITCH_REDIRECT_URI=http://localhost:3030/auth/callback
TWITCH_SCOPES=channel:read:polls channel:read:redemptions channel:manage:polls
```

### Login

```bash
npm start
```

Visit: `http://localhost:3030/auth/login`

After OAuth, EventSub will subscribe to poll events automatically.

## Adding Custom Assets

Place custom overlay assets in `public/assets/`:

```
public/assets/
├── scale-demo.png        # Custom scale background (optional)
├── your-item.png         # Custom item image
└── ...
```

Then use them in overlay URLs:
```
?item=your-item
```

Asset requirements:
- Format: PNG with transparency
- Size: ~200×200px for item images
- Name: lowercase, no spaces

## Common Commands

| Command | Purpose |
|---------|---------|
| `npm run demo` | Demo mode with random token |
| `npm start` | Real Twitch mode |
| `npm run urls` | Show OBS URLs |
| `npm run doctor` | Diagnostic check |
| `npm test` | Run tests |

## Troubleshooting

**Port 3030 is busy:**
```bash
npm run demo -- --port 3010
```

**OBS shows blank:**
1. Check server is running
2. Verify token in URL matches `.env`
3. Test URL in browser first

**Poll not updating:**
1. Confirm OAuth as broadcaster
2. Check `.env` has correct scopes
3. Restart server after scope changes

## Resources

- [Full Documentation](docs/) — Architecture, API, OBS setup, Twitch integration
- [Technical Docs](docs/API.md) — HTTP/WS endpoints
- [Twitch App Setup](docs/TWITCH_APP_KEYS.md) — Detailed OAuth flow

## License & Support

See [LICENSE](LICENSE) for details.

---

**Requirements:**
- Node.js 20+
- OBS Studio
- Twitch account (for real mode)
