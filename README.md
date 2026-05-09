# Veedcrawl MCP Server

Give your AI agent eyes on the entire social video web — not just individual links.

The official [Model Context Protocol](https://modelcontextprotocol.io) server for [Veedcrawl](https://veedcrawl.com). Drop it into Claude, Cursor, or any MCP-compatible host and your agent can instantly pull metadata, transcripts, and structured vision extraction from any public video on YouTube, TikTok, Instagram, X/Twitter, or Facebook — plus full creator profile snapshots with engagement stats, recent posts, and follower counts across TikTok and Instagram.

---

## What your agent can do

| Tool | What it returns |
|---|---|
| `get_video_metadata` | Title, description, author, view/like/comment counts, tags, duration, thumbnails |
| `get_video_transcript` | Full spoken transcript with timestamps — uses native captions or AI-generated speech-to-text |
| `extract_from_video` | Structured answer to any prompt: hooks, CTAs, sentiment, topics, claims, quotes — guided by optional JSON Schema |
| `get_tiktok_profile` | Creator bio, total video count, and up to 24 recent TikToks with full engagement stats per video |
| `get_instagram_profile` | Creator bio, verified status, follower/following/post counts, and up to 24 recent posts (video, image, carousel) with per-post stats |

### Why profile tools change everything

Every other video API requires you to already know a video URL. That means your agent is stuck doing retrieval — fetching content you already found.

`get_tiktok_profile` and `get_instagram_profile` unlock **discovery**. Hand the agent a username. It comes back with who the creator is, how large their audience is, and exactly what they've been posting, watches their all videos , identifies their hooks , their styles and content — without a single URL from you. Then it can chain into transcripts and extraction on its own.

**Audit a creator from scratch:**
```
get_instagram_profile(username="hubermanlab", limit=24)
→ 283M followers, verified, last 24 posts with view/like counts
→ get_video_transcript(url=top_video.url)
→ extract_from_video(url=top_video.url, prompt="List every health claim made and the evidence cited")
```

**Competitive analysis with no prep work:**
```
get_tiktok_profile(username=competitor_A, limit=24)
get_tiktok_profile(username=competitor_B, limit=24)
get_tiktok_profile(username=competitor_C, limit=24)
→ Compare posting frequency, avg views, top hashtags, engagement rates across all three
```

---

## Installation

```bash
npm install -g @veedcrawl/mcp
```

Get your API key at [veedcrawl.com](https://veedcrawl.com).

---

## Setup

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "veedcrawl": {
      "command": "veedcrawl-mcp",
      "env": {
        "VEEDCRAWL_API_KEY": "ma_your_key_here"
      }
    }
  }
}
```

Restart Claude Desktop. The five tools will appear automatically.

### Claude Code

```bash
claude mcp add veedcrawl -- env VEEDCRAWL_API_KEY=ma_your_key_here veedcrawl-mcp
```

### Cursor

Add to your Cursor MCP config (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "veedcrawl": {
      "command": "veedcrawl-mcp",
      "env": {
        "VEEDCRAWL_API_KEY": "ma_your_key_here"
      }
    }
  }
}
```

### Windsurf / Codeium

```json
{
  "mcpServers": {
    "veedcrawl": {
      "command": "veedcrawl-mcp",
      "env": {
        "VEEDCRAWL_API_KEY": "ma_your_key_here"
      }
    }
  }
}
```

---

## Tools reference

### `get_video_metadata`

Fetch structured metadata for any public video URL.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `url` | string | ✓ | Public video URL (YouTube, TikTok, Instagram, X/Twitter, Facebook) |

Returns: platform, title, description, author info, view/like/comment/share counts, duration, thumbnails, tags, publish timestamp.

---

### `get_video_transcript`

Return the complete transcript for a video. Polling and retries are handled internally — your agent gets the finished result.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `url` | string | ✓ | Public video URL or direct media file URL |
| `mode` | `auto` \| `native` \| `generate` | — | `native` = platform captions only · `generate` = AI speech-to-text only · `auto` = captions with AI fallback (default) |
| `lang` | string | — | Language hint, e.g. `en`, `es`, `ur` |

---

### `extract_from_video`

Ask any question about a video and get a structured answer. Optionally enforce output shape with a JSON Schema.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `url` | string | ✓ | Public video URL or direct media file URL |
| `prompt` | string | ✓ | What to extract — "List the key claims", "What is the hook?", "Summarize in three sentences" |
| `lang` | string | — | Language hint for transcription |
| `schema` | object | — | JSON Schema to constrain the output structure |

Example prompts that work well:
- `"Extract the hook, main argument, and call to action"`
- `"List every product mentioned with the timestamp it appears"`
- `"What claims does the speaker make? Rate each one as factual, opinion, or unverified"`
- `"Rewrite this as a Twitter thread"`

---

### `get_tiktok_profile`

Fetch a TikTok creator's public profile snapshot. Returns author info, total video count, and their most recent videos with full engagement stats per video.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `username` | string | ✓ (or `url`) | TikTok username, with or without `@` |
| `url` | string | ✓ (or `username`) | Full TikTok profile URL |
| `limit` | number | — | Videos to return: 1–24, default 12 |

Each video in the response is a full object with views, likes, comments, shares, caption, hashtags, thumbnail, and publish timestamp — ready to pass directly into `get_video_transcript` or `extract_from_video`.

---

### `get_instagram_profile`

Fetch an Instagram creator's public profile snapshot. Returns verified status, real follower and following counts, total post count, and recent content.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `username` | string | ✓ (or `url`) | Instagram username, with or without `@` |
| `url` | string | ✓ (or `username`) | Full Instagram profile URL |
| `limit` | number | — | Posts to return: 1–24, default 12 |

Post type is one of `video`, `post` (image), or `sidecar` (carousel). Video posts include a direct video URL you can pass into `get_video_transcript`.

---

## Platforms supported

YouTube · TikTok · Instagram · X / Twitter · Facebook

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `VEEDCRAWL_API_KEY` | ✓ | — | Your Veedcrawl API key. `X_API_KEY` is also accepted. |
| `VEEDCRAWL_BASE_URL` | — | `https://api.veedcrawl.com` | Override for self-hosted or staging |
| `VEEDCRAWL_POLL_INTERVAL_MS` | — | `1500` | Milliseconds between job status polls |
| `VEEDCRAWL_MAX_POLL_ATTEMPTS` | — | `120` | Max poll attempts before timeout (~3 min) |

---

## Links

- [Get an API key](https://veedcrawl.com)
- [Full API docs](https://veedcrawl.com/docs)
- [npm package](https://www.npmjs.com/package/@veedcrawl/mcp)
