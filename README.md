# `Veedcrawl MCP Server`

Official VEEDCRAWL MCP server for transcript, metadata, and AI extraction tools.

## Tools

- `get_video_metadata`
- `get_video_transcript`
- `extract_from_video`

## Environment Variables

- `VEEDCRAWL_API_KEY` required
- `VEEDCRAWL_BASE_URL` optional, defaults to `https://api.veedcrawl.com`
- `VEEDCRAWL_POLL_INTERVAL_MS` optional, defaults to `1500`
- `VEEDCRAWL_MAX_POLL_ATTEMPTS` optional, defaults to `120`

Compatibility aliases:

- `X_API_KEY`

## Cursor

Install the published package once:

```bash
npm install -g @veedcrawl/mcp
```

Then run the installed `veedcrawl-mcp` binary:

```json
{
  "mcpServers": {
    "veedcrawl": {
      "command": "veedcrawl-mcp",
      "args": [],
      "env": {
        "VEEDCRAWL_API_KEY": "ma_your_key_here"
      }
    }
  }
}
```

## Claude Code

```bash
npm install -g @veedcrawl/mcp
claude mcp add veedcrawl -- env VEEDCRAWL_API_KEY=ma_your_key_here veedcrawl-mcp
```
