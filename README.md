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
<img width="1123" height="869" alt="image" src="https://github.com/user-attachments/assets/24bb0c3b-1b6f-4d3d-a508-1b1a7db8929a" />

2. Choose an `API Mode` in extension settings if you do not want to use the current SillyTavern API.
<img width="554" height="868" alt="image" src="https://github.com/user-attachments/assets/22a4978d-8bb7-4a29-9872-40d807a4e1fa" />

3. Click `Summarize Chat` in the wand/extensions menu, or use the same button inside extension settings.
<img width="1171" height="442" alt="Capture1" src="https://github.com/user-attachments/assets/56a1b5d5-5200-48c9-91b4-8b67586ac3f4" />

4. Click chat bubbles to select them. Shift-click selects a range.
<img width="1134" height="824" alt="Capture2" src="https://github.com/user-attachments/assets/d87f7503-d313-4751-ab69-3023195b307e" />

6. Press `Summarize`.
<img width="1094" height="622" alt="image" src="https://github.com/user-attachments/assets/912da193-e86e-4235-8dde-bdd285047239" />
   
8. Review and edit the generated summary.
<img width="1008" height="628" alt="image" src="https://github.com/user-attachments/assets/d5df8d89-4651-4618-8b15-e272ce5f6ae0" />

9. Choose replace or insert from the preview modal
<img width="1008" height="628" alt="image" src="https://github.com/user-attachments/assets/d8b0e498-44df-4436-886e-de76e687782b" />

After the summary is generated, a **Summary Preview** modal will appear.
In this modal, you can review, edit, regenerate, copy, replace, or insert the generated summary.

### 9.1 Regenerate

Click **Regenerate** if you are not satisfied with the current summary.

Use this when:

* the summary is too long,
* the summary is too short,
* the summary misses important context,
* the summary includes unnecessary details,
* the summary sounds like roleplay continuation instead of a proper summary.

When clicked, the extension will send the selected messages to the chosen AI backend again and generate a new summary.

The selected chat messages will not be changed yet.
Changes only happen after you click **Replace Selected Messages** or **Insert Only**.

### 9.2 Copy

Click **Copy** to copy the generated summary to your clipboard.

Use this if you want to:

* save the summary manually,
* paste it into Author’s Note,
* paste it into Memory/Lorebook,
* edit it somewhere else,
* compare multiple generated summaries.

This button does not modify the chat.

### 9.3 Replace Selected Messages

Click **Replace Selected Messages** if you want to replace all selected chat bubbles with one summary bubble.

This is the main compression feature.

Example:

```txt
Before:
[Message 1]
[Message 2]
[Message 3]
[Message 4]
[Message 5]

After:
[Compressed Summary]
```

Use this when the selected messages are:

* low-value,
* repetitive,
* too long,
* messy,
* mostly filler,
* unnecessary for the main story,
* useful only as a compressed continuity note.

Before replacing, the extension will try to create a backup of the current chat.

If server-side backup fails, the extension may start a browser download backup instead and ask whether you want to continue.

Choose:

* **Continue** to proceed using the browser-downloaded backup.
* **Abort** to cancel the replacement and keep the original chat unchanged.

After replacement, the old selected messages should be removed from the actual chat data and replaced with one summary bubble.

### 9.4 Insert Only

Click **Insert Only** if you want to add the summary into the chat without deleting the selected messages.

Example:

```txt
Before:
[Message 1]
[Message 2]
[Message 3]

After:
[Message 1]
[Message 2]
[Message 3]
[Compressed Summary]
```

Use this when:

* you want to test the summary first,
* you are not ready to delete the original messages,
* the selected messages are important but still need a short summary,
* you want to manually compare the original chat with the generated summary.

This mode is safer than replacement because it does not remove any selected messages.

### 9.5 Cancel

Click **Cancel** to close the preview modal without changing the chat.

Use this when:

* the summary is not useful,
* you selected the wrong messages,
* you want to adjust settings first,
* you changed your mind.

Cancel will not replace, insert, or delete any chat messages.

### Recommended Usage

For cleaning low-value chat without breaking story continuity, use:

```txt
Regenerate if needed
→ Review and edit the summary manually
→ Replace Selected Messages
→ Confirm backup
→ Refresh/check the chat
```

For safer testing, use:

```txt
Regenerate if needed
→ Insert Only
→ Review the inserted summary in chat
→ Manually decide whether to delete old messages later
```


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
