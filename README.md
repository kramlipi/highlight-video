# Highlight Video

Free **Markdown to article video** generator. Paste a `.md` file, wrap key lines in `**bold**`, and export a vertical or horizontal MP4. Bold phrases become a **yellow highlighter** — newspaper, old yellow paper, and dark editorial themes included.

**Live app:** [https://highlight-video.cluevion.workers.dev](https://highlight-video.cluevion.workers.dev)

## What it does

- Markdown in, article video out
- Yellow highlighter on `**bold**` text
- Vertical (9:16) or horizontal (16:9)
- Themes: modern article, newspaper, parchment, dark editorial
- Motion: highlighter draw, Ken Burns, typewriter, auto-scroll
- Runs in the browser and exports MP4

## Start locally

```powershell
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Deploy

```powershell
npx wrangler login
npm run deploy
```

Do not commit Cloudflare credentials. Wrangler tokens stay in your local user config; `.wrangler/`, `.dev.vars`, and `.env` are gitignored.
