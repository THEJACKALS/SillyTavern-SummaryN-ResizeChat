# Summary & Resize Chat

Local SillyTavern extension for selecting several chat bubbles, summarizing them with the currently configured SillyTavern AI backend, previewing the summary, and then replacing or inserting a compact summary message.

## Install

Place this folder at:

- In the SillyTavern Extension Manager, use "Install from URL" and paste the following Git URL: 
```https://github.com/THEJACKALS/SillyTavern-ImageEmbedExpressions.git```
- Or... In Manual Options, Add this extension to the program in your SillyTavern file at 
```"SillyTavern\data\default-user\extensions\SillyTavern-ImageEmbedExpressions"```

OR
```txt
E:\AI\SillyTavern\data\default-user\extensions\summary-resize-chat
```

Restart or reload SillyTavern, then enable the extension if needed.

## Usage

1. Open a character or group chat.
2. Choose an `API Mode` in extension settings if you do not want to use the current SillyTavern API.
3. Click `Summarize Chat` in the wand/extensions menu, or use the same button inside extension settings.
4. Click chat bubbles to select them. Shift-click selects a range.
5. Press `Summarize`.
6. Review and edit the generated summary.
7. Choose replace or insert from the preview modal.

The selected bubbles use a blue border/overlay so they do not conflict with SillyTavern's red Delete Messages mode.

## API Modes

Recommended backend priority:

1. Current SillyTavern API
   Best for simple use and least CORS trouble.

2. LM Studio
   Best for local private summarization with easy model switching.

3. llama.cpp
   Best for advanced local users who want performance and control.

4. OpenAI-Compatible
   Best for custom servers, proxy, OpenRouter, LiteLLM, vLLM, TabbyAPI, LocalAI, etc.

5. AI Horde
   Best as free fallback, not recommended for private chat.

LM Studio default:

```txt
Base URL: http://127.0.0.1:1234/v1
Model: refresh from /v1/models or enter manually
API Key: empty
```

llama.cpp default:

```txt
Base URL: http://127.0.0.1:8080/v1
Model: summary-model
API Key: empty
```

Example llama.cpp server:

```bat
llama-server ^
  -m "E:\AI\Models\model.gguf" ^
  --host 127.0.0.1 ^
  --port 8080 ^
  -c 8192 ^
  -ngl 28 ^
  --alias summary-model
```

For OpenAI-Compatible backends, set the base URL to the root `/v1` endpoint, not `/chat/completions`. The extension adds `/chat/completions` itself.

If direct browser requests hit CORS, use `Current SillyTavern API`, enable CORS on the local backend, or add a server-side proxy/helper.

## Summary Model Tips

For summary, prefer instruct models that are stable and obedient. Avoid overly roleplay-biased models if they continue the scene instead of summarizing.

Recommended local summary settings:

```txt
Temperature: 0.15 - 0.25
Detail Level: Medium
Output Mode: Roleplay Continuity or Bullet Memory
Backup: Always
Preview: Always
```

Long selections can use chunked summarization:

```txt
Selected Messages
-> Chunk 1 Summary
-> Chunk 2 Summary
-> Merge Summaries
-> Final Continuity-Safe Summary
```

## Backup Behavior

The extension creates a backup before it changes the active chat. Client-side SillyTavern extensions cannot freely create Windows folders. This extension uses the real `/api/files/upload` endpoint, which writes to `data/default-user/user/files`, but that endpoint only accepts a flat filename. The backup filename includes sanitized character/group and chat names.

If server upload fails, the extension downloads the backup `.jsonl` in the browser and stops before modifying the chat unless you explicitly approve continuing.

Target nested backup folder from the recipe would require a small server-side helper because the public upload API does not create `SummaryResizeChatBackups/<name>/` subfolders.

## Horde Privacy

If AI Horde is your active backend, selected messages may be sent to Horde workers. Avoid sending private or sensitive information.

## Troubleshooting

- No button: reload SillyTavern and confirm the extension folder contains `manifest.json`.
- Still no button: open SillyTavern's extension manager and make sure `Summary & Resize Chat` is enabled. If it is disabled, SillyTavern stores that per-user in `data/<user>/settings.json`; do not commit that local settings change when sharing the extension.
- Generation fails: confirm your active SillyTavern API is connected and can generate normal replies.
- Backup fails: check browser console and server logs. The fallback browser download should still provide a backup.
- Chat changed mid-process: the extension aborts to avoid modifying the wrong chat.
