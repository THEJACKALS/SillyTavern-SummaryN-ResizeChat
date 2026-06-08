import {
    extension_settings,
    getContext,
    renderExtensionTemplateAsync,
} from '/scripts/extensions.js';
import { POPUP_RESULT, POPUP_TYPE } from '/scripts/popup.js';
import { getMessageTimeStamp } from '/scripts/RossAscends-mods.js';

const MODULE_NAME = 'summary_resize_chat';
function getExtensionName() {
    const match = new URL(import.meta.url).pathname.match(/scripts\/extensions\/(.+)\/index\.js$/);
    return match ? decodeURIComponent(match[1]) : 'third-party/summary-resize-chat';
}

const EXTENSION_NAME = getExtensionName();
const SETTINGS_TARGET = '#extensions_settings2';
const EVENT_NS = '.summaryResizeChat';
const PROMPT_VERSION = '1.0.0';

const DEFAULT_SETTINGS = {
    apiMode: 'current_st',
    language: 'Auto',
    detailLevel: 'Medium',
    outputMode: 'Narrative Summary',
    replaceStrategy: 'replace',
    backupBehavior: 'always',
    authorName: 'Summary',
    dryRun: false,
    lmStudioBaseUrl: 'http://127.0.0.1:1234/v1',
    lmStudioModel: '',
    openAiCompatibleBaseUrl: 'http://127.0.0.1:1234/v1',
    openAiCompatibleApiKey: '',
    openAiCompatibleModel: '',
    llamaCppBaseUrl: 'http://127.0.0.1:8080/v1',
    llamaCppModel: 'summary-model',
    llamaCppContextWarningThreshold: 12000,
    temperature: 0.2,
    maxTokensVeryShort: 256,
    maxTokensShort: 512,
    maxTokensMedium: 1024,
    maxTokensDetailed: 2048,
    requestTimeoutMs: 120000,
    maxRetries: 1,
    chunkedSummarization: true,
    chunkCharacterLimit: 12000,
};

const state = {
    selectionMode: false,
    selectedIds: new Set(),
    lastClickedId: null,
    busy: false,
    snapshotChatId: null,
    lastSelectionPayload: null,
};

window.summaryResizeChatExtension = window.summaryResizeChatExtension || {};

function settings() {
    if (!extension_settings[MODULE_NAME] || typeof extension_settings[MODULE_NAME] !== 'object') {
        extension_settings[MODULE_NAME] = { ...DEFAULT_SETTINGS };
    }
    extension_settings[MODULE_NAME] = { ...DEFAULT_SETTINGS, ...extension_settings[MODULE_NAME] };
    if (extension_settings[MODULE_NAME].apiMode === 'current') {
        extension_settings[MODULE_NAME].apiMode = 'current_st';
    }
    if (extension_settings[MODULE_NAME].apiMode === 'horde_if_active') {
        extension_settings[MODULE_NAME].apiMode = 'horde';
    }
    return extension_settings[MODULE_NAME];
}

function saveSettings() {
    getContext().saveSettingsDebounced?.();
}

function toast(kind, message, title = 'Summary & Resize Chat') {
    const fn = window.toastr?.[kind] || window.toastr?.info;
    if (fn) fn(message, title);
}

function getChatId() {
    const context = getContext();
    return context.getCurrentChatId?.() || context.chatId || '';
}

function getChatName() {
    const context = getContext();
    return context.chatId || context.getCurrentChatId?.() || 'chat';
}

function getOwnerName() {
    const context = getContext();
    if (context.groupId) {
        return context.groups?.find(group => group.id === context.groupId)?.name || 'group';
    }
    return context.name2 || context.characters?.[context.characterId]?.name || 'character';
}

function sanitizeName(value, fallback = 'untitled', maxLength = 80) {
    const clean = String(value || fallback)
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength)
        .trim();
    return clean || fallback;
}

function sanitizeStrictFilename(input, fallback = 'summary_backup') {
    let name = String(input || fallback);
    name = name.replace(/\s+/g, '_');
    name = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    name = name.replace(/_+/g, '_');
    name = name.replace(/^[_-]+|[_-]+$/g, '');
    if (!name) name = fallback;
    return name.slice(0, 120);
}

function getSafeTimestamp() {
    return new Date()
        .toISOString()
        .replace(/\.\d+Z$/, '')
        .replace(/:/g, '-')
        .replace('T', '_');
}

function buildSafeServerBackupName(characterName, chatName) {
    const timestamp = getSafeTimestamp();
    const entropy = Math.random().toString(36).slice(2, 8);
    return sanitizeStrictFilename(`SummaryResizeChatBackup_${timestamp}_${entropy}`);
}

function timestampForFile() {
    const date = new Date();
    const pad = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

function utf8ToBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return btoa(binary);
}

function downloadText(filename, text, mime = 'application/jsonl') {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function selectedIdsSorted() {
    return Array.from(state.selectedIds).sort((a, b) => a - b);
}

function selectedMessages() {
    const context = getContext();
    return selectedIdsSorted()
        .map(id => ({ id, message: context.chat?.[id] }))
        .filter(item => item.message);
}

function cleanMessageText(message) {
    return String(message?.mes || '')
        .replace(/<[^>]*>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function speakerName(message) {
    if (message?.is_user) return message.name || getContext().name1 || 'User';
    if (message?.is_system) return message.name || 'Narrator/System';
    return message?.name || getContext().name2 || 'Character';
}

function buildSelectedMessagesText(items) {
    return items.map(({ id, message }, index) => {
        const name = speakerName(message);
        const text = cleanMessageText(message);
        return `[${index}] ${name}:\n${text || '[empty message]'}\n`;
    }).join('\n');
}

function selectedStats(items = selectedMessages()) {
    const text = items.map(item => cleanMessageText(item.message)).join('\n');
    const charCount = text.length;
    return {
        messageCount: items.length,
        charCount,
        roughTokens: Math.ceil(charCount / 4),
    };
}

function updateSelectionVisuals() {
    $('#chat .mes').each((_, element) => {
        const id = Number(element.getAttribute('mesid'));
        element.classList.toggle('summary-resize-selected', state.selectedIds.has(id));
    });
    $('#summary_resize_toolbar .summary-resize-count').text(`${state.selectedIds.size} selected`);
}

function ensureSelectionChrome() {
    if (!$('#summary_resize_banner').length) {
        $('<div id="summary_resize_banner"></div>')
            .text('Summary Selection Mode Active')
            .appendTo(document.body);
    }
    if (!$('#summary_resize_toolbar').length) {
        const toolbar = $('<div id="summary_resize_toolbar"></div>');
        toolbar.append($('<div class="summary-resize-count"></div>').text('0 selected'));
        toolbar.append($('<button type="button" class="menu_button" id="summary_resize_toolbar_summarize"></button>').text('Summarize'));
        toolbar.append($('<button type="button" class="menu_button" id="summary_resize_toolbar_clear"></button>').text('Clear Selection'));
        toolbar.append($('<button type="button" class="menu_button" id="summary_resize_toolbar_cancel"></button>').text('Cancel'));
        $(document.body).append(toolbar);
    }
}

function clearSelection() {
    state.selectedIds.clear();
    state.lastClickedId = null;
    updateSelectionVisuals();
}

function enterSelectionMode() {
    const context = getContext();
    if (!Array.isArray(context.chat) || context.chat.length === 0) {
        toast('warning', 'No active chat messages to select.');
        return;
    }
    state.selectionMode = true;
    state.snapshotChatId = getChatId();
    state.selectedIds.clear();
    state.lastClickedId = null;
    $('body').addClass('summary-resize-selection-mode');
    ensureSelectionChrome();
    updateSelectionVisuals();
}

function exitSelectionMode() {
    state.selectionMode = false;
    state.selectedIds.clear();
    state.lastClickedId = null;
    $('body').removeClass('summary-resize-selection-mode');
    $('#chat .mes').removeClass('summary-resize-selected');
    $('#summary_resize_banner, #summary_resize_toolbar').remove();
}

function toggleMessageSelection(id, event) {
    if (!Number.isInteger(id) || id < 0) return;
    if (event.shiftKey && Number.isInteger(state.lastClickedId)) {
        const start = Math.min(state.lastClickedId, id);
        const end = Math.max(state.lastClickedId, id);
        for (let index = start; index <= end; index++) {
            if (getContext().chat?.[index]) state.selectedIds.add(index);
        }
    } else if (state.selectedIds.has(id)) {
        state.selectedIds.delete(id);
    } else {
        state.selectedIds.add(id);
    }
    state.lastClickedId = id;
    updateSelectionVisuals();
}

function buildPromptParts(items) {
    const s = settings();
    const selectedText = buildSelectedMessagesText(items);
    const roleplayFormat = s.outputMode === 'Roleplay Continuity'
        ? '\nFor Roleplay Continuity, use this exact output structure:\n[Summary of compressed chat]\n- Current situation:\n- Important events:\n- Character emotions:\n- Relationship changes:\n- World/lore details:\n- Pending actions:\n'
        : '';

    const systemPrompt = `You are a precise chat summarizer for SillyTavern roleplay/chat logs.
Your task is to summarize only the selected messages.
Preserve important facts, character decisions, relationships, promises, locations, emotional state, ongoing conflicts, plans, inventory/items, worldbuilding details, and unresolved plot threads.
Do not add new events.
Do not invent motivations.
Do not continue the story.
Do not roleplay.
Do not write as any character unless explicitly requested.
Write a clean summary that can replace the selected chat messages without breaking continuity.`;

    const userPrompt = `Summarize the following selected SillyTavern chat messages.

Requirements:
- Keep continuity intact.
- Mention who did what.
- Preserve important emotional beats.
- Preserve worldbuilding and lore details.
- Preserve unresolved questions or pending actions.
- Remove filler, repetition, stuttering, and redundant dialogue.
- Output only the summary.
- Language: ${s.language}
- Detail level: ${s.detailLevel}
- Output mode: ${s.outputMode}
${roleplayFormat}
Selected messages:

${selectedText}`;

    return { systemPrompt, userPrompt, selectedText };
}

function buildPrompt(items) {
    const { systemPrompt, userPrompt } = buildPromptParts(items);
    return `System prompt:\n${systemPrompt}\n\nUser prompt:\n${userPrompt}`;
}

function responseLengthForDetail() {
    switch (settings().detailLevel) {
        case 'Very Short': return 180;
        case 'Short': return 320;
        case 'Detailed': return 900;
        default: return 550;
    }
}

function maxTokensForDetail() {
    const s = settings();
    switch (s.detailLevel) {
        case 'Very Short': return Number(s.maxTokensVeryShort) || 256;
        case 'Short': return Number(s.maxTokensShort) || 512;
        case 'Detailed': return Number(s.maxTokensDetailed) || 2048;
        default: return Number(s.maxTokensMedium) || 1024;
    }
}

async function confirmSummarize(items) {
    const stats = selectedStats(items);
    const content = $('<div></div>');
    content.append($('<h3></h3>').text('Summarize selected messages?'));
    content.append($('<p></p>').text(`Messages: ${stats.messageCount}`));
    content.append($('<p></p>').text(`Estimated size: ${stats.charCount} characters, roughly ${stats.roughTokens} tokens.`));
    if (settings().apiMode === 'horde' || getContext().mainApi === 'horde') {
        content.append($('<p></p>').text('AI Horde warning: selected messages may be sent to Horde workers.'));
    }
    if (settings().apiMode === 'llamacpp' && stats.charCount > Number(settings().llamaCppContextWarningThreshold || 12000)) {
        content.append($('<p></p>').text('Selected messages may be too long for the current llama.cpp context. Chunked summarization is recommended.'));
    }
    const result = await getContext().callGenericPopup(content, POPUP_TYPE.CONFIRM, null, {
        okButton: 'Summarize',
        cancelButton: 'Cancel',
    });
    return result === POPUP_RESULT.AFFIRMATIVE;
}

async function generateSummary(items) {
    const promptParts = buildPromptParts(items);
    const result = await generateSummaryWithSelectedBackend({
        items,
        ...promptParts,
        maxTokens: maxTokensForDetail(),
        allowChunk: true,
    });
    const summary = String(result || '').trim();
    if (!summary) throw new Error('The model returned an empty summary.');
    return summary;
}

function cleanBaseUrl(baseUrl) {
    const value = String(baseUrl || '').trim().replace(/\/+$/, '');
    if (/\/chat\/completions$/i.test(value)) {
        throw new Error('Base URL must point to the root OpenAI-compatible endpoint, for example http://127.0.0.1:1234/v1. Do not include /chat/completions.');
    }
    return value;
}

function providerConfig() {
    const s = settings();
    if (s.apiMode === 'lm_studio') {
        return {
            label: 'LM Studio',
            baseUrl: s.lmStudioBaseUrl || DEFAULT_SETTINGS.lmStudioBaseUrl,
            apiKey: '',
            model: s.lmStudioModel,
            temperature: Number(s.temperature) || 0.2,
        };
    }
    if (s.apiMode === 'openai_compatible') {
        return {
            label: 'OpenAI-Compatible',
            baseUrl: s.openAiCompatibleBaseUrl || DEFAULT_SETTINGS.openAiCompatibleBaseUrl,
            apiKey: s.openAiCompatibleApiKey || '',
            model: s.openAiCompatibleModel,
            temperature: Number(s.temperature) || 0.2,
        };
    }
    if (s.apiMode === 'llamacpp') {
        return {
            label: 'llama.cpp',
            baseUrl: s.llamaCppBaseUrl || DEFAULT_SETTINGS.llamaCppBaseUrl,
            apiKey: '',
            model: s.llamaCppModel || 'summary-model',
            temperature: Number(s.temperature) || 0.15,
        };
    }
    return null;
}

function backendLabel() {
    const s = settings();
    if (s.apiMode === 'current_st') return `Current SillyTavern API (${getContext().mainApi || 'unknown'})`;
    if (s.apiMode === 'horde') return 'AI Horde via SillyTavern';
    return providerConfig()?.label || s.apiMode;
}

function isOpenAICompatibleMode() {
    return ['lm_studio', 'openai_compatible', 'llamacpp'].includes(settings().apiMode);
}

async function fetchOpenAICompatibleModels(baseUrl, apiKey = '') {
    const endpoint = `${cleanBaseUrl(baseUrl)}/models`;
    const headers = {};
    if (apiKey && apiKey.trim()) {
        headers.Authorization = `Bearer ${apiKey.trim()}`;
    }
    let response;
    try {
        response = await fetch(endpoint, { method: 'GET', headers });
    } catch (error) {
        throw new Error(`Could not call local API directly. This may be caused by CORS. Try using Current SillyTavern API mode, enable CORS on your local backend, or add a server-side proxy/helper. ${error.message || error}`);
    }
    if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status} ${await response.text()}`);
    }
    const data = await response.json();
    return data?.data?.map(model => model.id).filter(Boolean) || [];
}

async function callOpenAICompatible({
    baseUrl,
    apiKey = '',
    model,
    systemPrompt,
    userPrompt,
    temperature = 0.2,
    maxTokens = 1024,
    timeoutMs = 120000,
    maxRetries = 1,
}) {
    if (!model || !String(model).trim()) {
        throw new Error('No model selected. Refresh models or enter model ID manually.');
    }

    const endpoint = `${cleanBaseUrl(baseUrl)}/chat/completions`;
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey && apiKey.trim().length > 0) {
        headers.Authorization = `Bearer ${apiKey.trim()}`;
    }

    let lastError = null;
    for (let attempt = 0; attempt <= Number(maxRetries || 0); attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), Number(timeoutMs) || 120000);
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model: String(model).trim(),
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    temperature,
                    top_p: 0.9,
                    max_tokens: maxTokens,
                    stream: false,
                }),
                signal: controller.signal,
            });
            if (!response.ok) {
                throw new Error(`API error ${response.status}: ${await response.text()}`);
            }
            const data = await response.json();
            const text = data?.choices?.[0]?.message?.content;
            if (!text || !text.trim()) {
                throw new Error('The model returned an empty summary. Try increasing max tokens or using another model.');
            }
            return text.trim();
        } catch (error) {
            lastError = error;
            const message = String(error.message || error);
            if (message.includes('Failed to fetch') || message.includes('NetworkError') || error.name === 'TypeError') {
                throw new Error(`Could not call local API directly. This may be caused by CORS. Try using Current SillyTavern API mode, enable CORS on your local backend, or add a server-side proxy/helper. ${message}`);
            }
            if (error.name === 'AbortError') {
                lastError = new Error(`Request timed out after ${timeoutMs} ms.`);
            }
            if (attempt >= Number(maxRetries || 0)) break;
        } finally {
            clearTimeout(timeout);
        }
    }
    throw lastError || new Error('Summary request failed.');
}

async function generateWithCurrentSillyTavernApi({ systemPrompt, userPrompt }) {
    const context = getContext();
    if (typeof context.generateQuietPrompt !== 'function') {
        throw new Error('SillyTavern generateQuietPrompt() is not available.');
    }
    return await context.generateQuietPrompt({
        quietPrompt: `System prompt:\n${systemPrompt}\n\nUser prompt:\n${userPrompt}`,
        quietName: settings().authorName || 'Summary',
        skipWIAN: true,
        responseLength: responseLengthForDetail(),
        removeReasoning: true,
        trimToSentence: false,
    });
}

async function generateWithHordeViaSillyTavern(options) {
    if (getContext().mainApi !== 'horde') {
        throw new Error('AI Horde mode requires SillyTavern main API to be set to Horde. Switch SillyTavern API to Horde or use Current SillyTavern API mode.');
    }
    return await generateWithCurrentSillyTavernApi(options);
}

async function generateSingleSummaryBackend(options) {
    const s = settings();
    switch (s.apiMode) {
        case 'current_st':
            return await generateWithCurrentSillyTavernApi(options);
        case 'horde':
            return await generateWithHordeViaSillyTavern(options);
        case 'lm_studio':
        case 'openai_compatible':
        case 'llamacpp': {
            const config = providerConfig();
            if (s.apiMode === 'lm_studio' && !config.baseUrl) {
                throw new Error('LM Studio server is not reachable. Open LM Studio, load a model, and start the local server.');
            }
            if (s.apiMode === 'llamacpp' && !config.baseUrl) {
                throw new Error('llama.cpp server is not reachable. Start llama-server first.');
            }
            return await callOpenAICompatible({
                baseUrl: config.baseUrl,
                apiKey: config.apiKey,
                model: config.model,
                systemPrompt: options.systemPrompt,
                userPrompt: options.userPrompt,
                temperature: config.temperature,
                maxTokens: options.maxTokens,
                timeoutMs: s.requestTimeoutMs,
                maxRetries: s.maxRetries,
            });
        }
        default:
            throw new Error(`Unknown API mode: ${s.apiMode}`);
    }
}

function chunkItemsByCharacterLimit(items, limit) {
    const chunks = [];
    let current = [];
    let currentLength = 0;
    for (const item of items) {
        const itemLength = buildSelectedMessagesText([item]).length;
        if (current.length && currentLength + itemLength > limit) {
            chunks.push(current);
            current = [];
            currentLength = 0;
        }
        current.push(item);
        currentLength += itemLength;
    }
    if (current.length) chunks.push(current);
    return chunks;
}

async function generateChunkedSummary(options) {
    const s = settings();
    const chunks = chunkItemsByCharacterLimit(options.items, Number(s.chunkCharacterLimit) || 12000);
    if (chunks.length <= 1) {
        return await generateSingleSummaryBackend({ ...options, allowChunk: false });
    }

    toast('info', `Long selection detected. Summarizing ${chunks.length} chunks...`);
    const partials = [];
    for (let index = 0; index < chunks.length; index++) {
        const promptParts = buildPromptParts(chunks[index]);
        const partial = await generateSingleSummaryBackend({
            ...promptParts,
            maxTokens: Math.min(options.maxTokens, 1024),
            allowChunk: false,
        });
        partials.push(`Chunk ${index + 1} Summary:\n${partial}`);
    }

    const mergeSystemPrompt = 'You are merging multiple partial summaries from the same SillyTavern chat segment.\nCombine them into one clean continuity-safe summary.\nRemove duplicates.\nPreserve chronological order.\nDo not invent events.\nDo not continue the story.\nOutput only the final compressed summary.';
    const mergeUserPrompt = `Merge these partial summaries into one final summary.\n\nLanguage: ${s.language}\nDetail level: ${s.detailLevel}\nOutput mode: ${s.outputMode}\n\n${partials.join('\n\n')}`;
    return await generateSingleSummaryBackend({
        systemPrompt: mergeSystemPrompt,
        userPrompt: mergeUserPrompt,
        maxTokens: options.maxTokens,
        allowChunk: false,
    });
}

async function generateSummaryWithSelectedBackend(options) {
    const s = settings();
    const selectedLength = String(options.selectedText || '').length;
    const shouldChunk = options.allowChunk !== false
        && s.chunkedSummarization
        && Array.isArray(options.items)
        && selectedLength > Number(s.chunkCharacterLimit || 12000);
    if (shouldChunk) {
        return await generateChunkedSummary(options);
    }
    return await generateSingleSummaryBackend(options);
}

function maybeWarnAboutSummary(summary, originalStats) {
    if (summary.length > originalStats.charCount * 0.9) {
        toast('warning', 'The summary is almost as long as the original selection.');
    }
    if (/^\s*["“*]|^\s*\w+\s*:/u.test(summary) && !summary.includes('Summary')) {
        toast('warning', 'The output looks like roleplay continuation, not summary. Consider regenerating with stricter prompt.');
        console.warn('Summary & Resize Chat: output may look like continued roleplay. Preview approval is required.');
    }
}

function backupNames() {
    const serverBackupName = buildSafeServerBackupName(getOwnerName(), getChatName());
    return {
        serverBackupName,
        browserDownloadName: `${serverBackupName}.jsonl`,
    };
}

function backupJsonl() {
    const context = getContext();
    const header = {
        user_name: context.name1 || 'User',
        character_name: getOwnerName(),
        chat_name: getChatName(),
        create_date: new Date().toISOString(),
        chat_metadata: context.chatMetadata || {},
        summary_resize_chat_backup: true,
    };
    return [header, ...context.chat].map(row => JSON.stringify(row)).join('\n');
}

async function uploadBackup(filename, text) {
    const safeFilename = sanitizeStrictFilename(filename, 'SummaryResizeChatBackup');
    console.debug('[Summary Resize Chat] Uploading backup file:', safeFilename);
    const response = await fetch('/api/files/upload', {
        method: 'POST',
        headers: getContext().getRequestHeaders(),
        body: JSON.stringify({
            name: safeFilename,
            data: utf8ToBase64(text),
        }),
    });
    if (!response.ok) {
        throw new Error(await response.text());
    }
    const data = await response.json();
    return data.path || safeFilename;
}

async function uploadBackupWithRetry(filename, text) {
    try {
        return await uploadBackup(filename, text);
    } catch (error) {
        const message = String(error.message || error);
        if (!message.includes('Illegal character in filename')) {
            throw error;
        }
        const fallbackName = sanitizeStrictFilename(`SummaryResizeChatBackup_${Date.now()}`);
        console.warn('[Summary Resize Chat] Retrying backup upload with fallback name:', fallbackName, error);
        return await uploadBackup(fallbackName, text);
    }
}

async function showBackupFailedConfirm(error) {
    const content = $('<div></div>');
    content.append($('<h3></h3>').text('Backup upload failed'));
    content.append($('<p></p>').text('A browser download was started instead. Continue without a server-side backup?'));
    content.append($('<p></p>').text(String(error.message || error)));
    const result = await getContext().callGenericPopup(content, POPUP_TYPE.CONFIRM, null, {
        okButton: 'Continue',
        cancelButton: 'Abort',
    });
    return result === POPUP_RESULT.AFFIRMATIVE;
}

async function createBackupBeforeChange() {
    const s = settings();
    const { serverBackupName, browserDownloadName } = backupNames();
    const text = backupJsonl();

    if (s.backupBehavior === 'ask') {
        const content = $('<div></div>');
        content.append($('<h3></h3>').text('Create backup before modifying chat?'));
        content.append($('<p></p>').text(browserDownloadName));
        const result = await getContext().callGenericPopup(content, POPUP_TYPE.CONFIRM, null, {
            okButton: 'Create Backup',
            cancelButton: 'Cancel',
            customButtons: ['Continue Without Backup'],
        });
        if (result === POPUP_RESULT.CANCELLED || result === POPUP_RESULT.NEGATIVE) {
            return { ok: false, mode: 'aborted', error: new Error('Operation cancelled before backup.') };
        }
        if (result === POPUP_RESULT.CUSTOM1) {
            return { ok: true, mode: 'skipped', path: '' };
        }
    }

    try {
        const path = await uploadBackupWithRetry(serverBackupName, text);
        return { ok: true, mode: 'server', path };
    } catch (error) {
        console.warn('[Summary Resize Chat] Server backup failed:', error);
        try {
            downloadText(browserDownloadName, text);
        } catch (downloadError) {
            console.error('[Summary Resize Chat] Browser backup failed:', downloadError);
            toast('error', 'Backup failed. Replace aborted.');
            return { ok: false, mode: 'failed', error: downloadError };
        }
        if (s.backupBehavior === 'always') {
            toast('warning', 'Server backup failed, but a browser backup was downloaded. Continuing.');
            return { ok: true, mode: 'browser_download', path: `download:${browserDownloadName}`, error };
        }
        const continueAnyway = await showBackupFailedConfirm(error);
        if (!continueAnyway) {
            return { ok: false, mode: 'aborted', error };
        }
        return { ok: true, mode: 'browser_download', path: `download:${browserDownloadName}`, error };
    }
}

function createSummaryMessage(summary, items, backupPath) {
    const ids = items.map(item => item.id);
    return {
        name: settings().authorName || 'Summary',
        is_user: false,
        is_system: false,
        send_date: getMessageTimeStamp(),
        mes: summary,
        extra: {
            summary_resize_chat: true,
            type: 'compressed_summary',
            created_at: new Date().toISOString(),
            original_message_count: ids.length,
            original_indices: ids,
            backup_file: backupPath || '',
            model: {
                backend_used: backendLabel(),
            },
            summary_prompt_version: PROMPT_VERSION,
        },
    };
}

function cloneChatSnapshot(chat) {
    if (typeof structuredClone === 'function') {
        return structuredClone(chat);
    }
    return JSON.parse(JSON.stringify(chat));
}

async function saveCurrentChatSafe() {
    const context = getContext();
    if (typeof context.saveChatConditional === 'function') {
        await context.saveChatConditional();
        return;
    }
    if (typeof context.saveChat === 'function') {
        await context.saveChat();
        return;
    }
    if (typeof window.saveChatConditional === 'function') {
        await window.saveChatConditional();
        return;
    }
    throw new Error('Tidak menemukan fungsi save chat. Gunakan saveChatConditional/saveChat dari SillyTavern sesuai versi yang berjalan.');
}

async function reloadCurrentChatSafe() {
    const context = getContext();
    if (typeof context.reloadCurrentChat === 'function') {
        await context.reloadCurrentChat();
        return;
    }
    if (typeof window.reloadCurrentChat === 'function') {
        await window.reloadCurrentChat();
        return;
    }
    if (typeof context.printMessages === 'function') {
        await context.printMessages();
        return;
    }
    location.reload();
}

async function applySummary(summary, items, mode) {
    if (!summary.trim()) throw new Error('Summary is empty.');
    if (state.snapshotChatId !== getChatId()) throw new Error('Chat changed while summarizing. Aborting.');

    const context = getContext();
    if (!context || !Array.isArray(context.chat)) {
        throw new Error('Chat context tidak ditemukan.');
    }

    const ids = [...new Set(items.map(item => Number(item.id)))]
        .filter(Number.isInteger)
        .sort((a, b) => a - b);

    if (ids.length === 0) {
        throw new Error('Tidak ada pesan yang dipilih.');
    }

    const invalidIndex = ids.find(index => index < 0 || index >= context.chat.length);
    if (invalidIndex !== undefined) {
        throw new Error(`Index pesan tidak valid: ${invalidIndex}`);
    }

    for (const { id, message } of items) {
        if (context.chat[id] !== message) {
            throw new Error(`Message #${id} changed before applying summary. Aborting.`);
        }
    }

    const backupResult = await createBackupBeforeChange();
    if (!backupResult?.ok) {
        toast('warning', 'Replace dibatalkan karena backup gagal atau dibatalkan user.');
        return;
    }
    const backupPath = backupResult.path || '';
    if (settings().dryRun) {
        toast('info', 'Dry Run is enabled. Backup created, chat was not changed.');
        return;
    }

    const summaryMessage = createSummaryMessage(summary.trim(), items, backupPath);
    const firstIndex = Math.min(...ids);
    const lastIndex = Math.max(...ids);
    const oldLength = context.chat.length;
    const originalChatSnapshot = cloneChatSnapshot(context.chat);
    const originalMetadataSnapshot = cloneChatSnapshot(context.chatMetadata || {});

    console.debug('[Summary Resize Chat] Selected indices:', ids);
    console.debug('[Summary Resize Chat] Chat length before:', oldLength);
    console.debug('[Summary Resize Chat] Insert at:', mode === 'insert_after' ? lastIndex + 1 : firstIndex);

    try {
        if (mode === 'replace') {
            for (const id of [...ids].sort((a, b) => b - a)) {
                context.chat.splice(id, 1);
            }
            context.chat.splice(firstIndex, 0, summaryMessage);
        } else if (mode === 'insert_before') {
            context.chat.splice(firstIndex, 0, summaryMessage);
        } else {
            context.chat.splice(lastIndex + 1, 0, summaryMessage);
        }

        console.debug('[Summary Resize Chat] Chat length after:', context.chat.length);
        if (mode === 'replace') {
            console.debug('[Summary Resize Chat] Expected length after replace:', oldLength - ids.length + 1);
        }

        context.chatMetadata[MODULE_NAME] = {
            lastBackupFile: backupPath || '',
            lastBackupMode: backupResult.mode || '',
            lastCompressedAt: new Date().toISOString(),
            lastOriginalMessageCount: ids.length,
        };
        context.chatMetadata.tainted = true;

        await saveCurrentChatSafe();
        await reloadCurrentChatSafe();
        toast('success', mode === 'replace'
            ? `Berhasil replace ${ids.length} pesan dengan 1 summary bubble.`
            : 'Summary inserted and chat saved.');
        exitSelectionMode();
    } catch (error) {
        context.chat.length = 0;
        context.chat.push(...originalChatSnapshot);
        if (context.chatMetadata && typeof context.chatMetadata === 'object') {
            Object.keys(context.chatMetadata).forEach(key => delete context.chatMetadata[key]);
            Object.assign(context.chatMetadata, originalMetadataSnapshot);
        }
        console.error('[Summary Resize Chat] Replace rolled back:', error);
        toast('error', `Replace gagal dan chat dikembalikan: ${error.message || error}`);
        throw error;
    }
}

function compressionStats(originalStats, summary) {
    const summaryChars = summary.length;
    const ratio = originalStats.charCount > 0 ? Math.round((summaryChars / originalStats.charCount) * 100) : 0;
    return {
        summaryChars,
        ratio,
    };
}

function updatePreviewStats(originalStats) {
    const summary = String($('#summary_resize_preview_text').val() || '');
    const stats = compressionStats(originalStats, summary);
    $('#summary_resize_summary_chars').text(String(stats.summaryChars));
    $('#summary_resize_compression_ratio').text(`${stats.ratio}%`);
}

function showPreviewModal(initialSummary, items) {
    const originalStats = selectedStats(items);
    let summary = initialSummary;

    return new Promise(resolve => {
        $('#summary_resize_modal_shadow').remove();

        const shadow = $('<div id="summary_resize_modal_shadow"></div>');
        const modal = $('<div id="summary_resize_modal"></div>');
        modal.append($('<h3></h3>').text('Summary Preview'));

        const stats = $('<div class="summary-resize-stats"></div>');
        stats.append($('<span></span>').text(`Original messages: ${originalStats.messageCount}`));
        stats.append($('<span></span>').text(`Original chars: ${originalStats.charCount}`));
        stats.append($('<span></span>').text('Summary chars: '), $('<span id="summary_resize_summary_chars"></span>'));
        stats.append($('<span></span>').text('Compression ratio: '), $('<span id="summary_resize_compression_ratio"></span>'));
        modal.append(stats);

        const textarea = $('<textarea id="summary_resize_preview_text" class="text_pole"></textarea>').val(summary);
        modal.append(textarea);

        const actions = $('<div class="summary-resize-modal-actions"></div>');
        const regenerate = $('<button type="button" class="menu_button"></button>').text('Regenerate');
        const copy = $('<button type="button" class="menu_button"></button>').text('Copy');
        const replace = $('<button type="button" class="menu_button"></button>').text('Replace Selected Messages');
        const insert = $('<button type="button" class="menu_button"></button>').text('Insert Only');
        const cancel = $('<button type="button" class="menu_button"></button>').text('Cancel');
        actions.append(regenerate, copy, replace, insert, cancel);
        modal.append(actions);
        shadow.append(modal);
        $(document.body).append(shadow);

        const close = value => {
            shadow.remove();
            resolve(value);
        };

        textarea.on(`input${EVENT_NS}`, () => updatePreviewStats(originalStats));
        cancel.on(`click${EVENT_NS}`, () => close(null));
        copy.on(`click${EVENT_NS}`, async () => {
            await navigator.clipboard?.writeText(String(textarea.val() || ''));
            toast('success', 'Summary copied.');
        });
        regenerate.on(`click${EVENT_NS}`, async () => {
            regenerate.prop('disabled', true).text('Regenerating...');
            try {
                summary = await generateSummary(items);
                textarea.val(summary);
                maybeWarnAboutSummary(summary, originalStats);
                updatePreviewStats(originalStats);
            } catch (error) {
                toast('error', String(error.message || error));
            } finally {
                regenerate.prop('disabled', false).text('Regenerate');
            }
        });
        replace.on(`click${EVENT_NS}`, () => close({ summary: String(textarea.val() || '').trim(), mode: 'replace' }));
        insert.on(`click${EVENT_NS}`, () => {
            const configured = settings().replaceStrategy;
            close({ summary: String(textarea.val() || '').trim(), mode: configured === 'insert_before' ? 'insert_before' : 'insert_after' });
        });

        updatePreviewStats(originalStats);
        textarea.trigger('focus');
    });
}

async function summarizeSelection() {
    if (state.busy) return;
    const items = selectedMessages();
    if (items.length === 0) {
        toast('warning', 'Select at least one message first.');
        return;
    }
    if (items.length === 1) {
        toast('info', 'One message selected. You can summarize it, but compression may be minimal.');
    }
    const nonEmpty = items.filter(item => cleanMessageText(item.message));
    if (nonEmpty.length === 0) {
        toast('warning', 'Selected messages are empty.');
        return;
    }
    if (!(await confirmSummarize(nonEmpty))) return;

    state.busy = true;
    try {
        const originalStats = selectedStats(nonEmpty);
        toast('info', 'Generating summary...');
        const summary = await generateSummary(nonEmpty);
        maybeWarnAboutSummary(summary, originalStats);
        const decision = await showPreviewModal(summary, nonEmpty);
        if (!decision) return;
        const mode = decision.mode || settings().replaceStrategy;
        await applySummary(decision.summary, nonEmpty, mode);
    } catch (error) {
        console.error('Summary & Resize Chat failed:', error);
        toast('error', String(error.message || error));
    } finally {
        state.busy = false;
    }
}

function exportSelection() {
    const items = selectedMessages();
    if (!items.length) {
        toast('warning', 'No selected messages to export. Enter selection mode and pick bubbles first.');
        return;
    }
    const filename = `${sanitizeName(getOwnerName())}__selected__${timestampForFile()}.txt`;
    downloadText(filename, buildSelectedMessagesText(items), 'text/plain');
}

async function renderSettings() {
    if (!$('#summary_resize_chat_settings').length) {
        const html = await renderExtensionTemplateAsync(EXTENSION_NAME, 'settings');
        $(SETTINGS_TARGET).append(html);
    }
    bindSettingsControls();
}

function setConnectionStatus(message, kind = 'info') {
    const element = $('#summary_resize_connection_status');
    element.text(message || '');
    element.removeClass('success warning error');
    if (kind) element.addClass(kind);
}

function updateBackendSettingsVisibility() {
    const mode = settings().apiMode;
    $('.summary-resize-provider-fields').removeClass('active');
    $(`.summary-resize-provider-fields[data-provider="${mode}"]`).addClass('active');
    const showBackendPanel = ['lm_studio', 'openai_compatible', 'llamacpp'].includes(mode);
    $('#summary_resize_backend_panel').toggle(showBackendPanel || mode === 'horde');
    $('#summary_resize_test_connection, #summary_resize_refresh_models, #summary_resize_send_test_prompt').toggle(showBackendPanel);
    $('.summary-resize-api-controls').toggle(showBackendPanel);
    if (mode === 'horde') {
        setConnectionStatus('AI Horde may send selected messages to volunteer workers. Avoid summarizing private or sensitive content.', 'warning');
    } else if (!showBackendPanel) {
        setConnectionStatus('');
    }
}

function fillModelDatalist(mode, models) {
    const datalistId = {
        lm_studio: '#summary_resize_lm_models',
        openai_compatible: '#summary_resize_oai_models',
        llamacpp: '#summary_resize_llama_models',
    }[mode];
    const datalist = $(datalistId);
    datalist.empty();
    for (const model of models) {
        datalist.append($('<option></option>').attr('value', model));
    }
}

async function refreshModelsForCurrentBackend() {
    const config = providerConfig();
    const mode = settings().apiMode;
    if (!config) {
        toast('warning', 'Model refresh is only available for LM Studio, OpenAI-Compatible, and llama.cpp.');
        return [];
    }
    setConnectionStatus(`Fetching models from ${config.label}...`);
    const models = await fetchOpenAICompatibleModels(config.baseUrl, config.apiKey);
    fillModelDatalist(mode, models);
    if (models.length) {
        if (mode === 'lm_studio' && !settings().lmStudioModel) $('#summary_resize_lm_model').val(models[0]).trigger('input');
        if (mode === 'openai_compatible' && !settings().openAiCompatibleModel) $('#summary_resize_oai_model').val(models[0]).trigger('input');
        if (mode === 'llamacpp' && !settings().llamaCppModel) $('#summary_resize_llama_model').val(models[0]).trigger('input');
        setConnectionStatus(`Connected. Found ${models.length} model(s).`, 'success');
    } else {
        setConnectionStatus('Connected, but no models were returned. Enter model ID manually.', 'warning');
    }
    return models;
}

async function testConnectionForCurrentBackend() {
    try {
        const mode = settings().apiMode;
        if (mode === 'lm_studio') setConnectionStatus('Testing LM Studio...');
        if (mode === 'llamacpp') setConnectionStatus('Testing llama.cpp...');
        if (mode === 'openai_compatible') setConnectionStatus('Testing OpenAI-Compatible backend...');
        await refreshModelsForCurrentBackend();
        toast('success', 'Connection test completed.');
    } catch (error) {
        const mode = settings().apiMode;
        let message = String(error.message || error);
        if (mode === 'lm_studio') {
            message = `LM Studio server is not reachable. Open LM Studio, load a model, and start the local server. ${message}`;
        } else if (mode === 'llamacpp') {
            message = `llama.cpp server is not reachable. Start llama-server first. ${message}`;
        }
        setConnectionStatus(message, 'error');
        toast('error', message);
    }
}

async function sendTestSummaryPrompt() {
    try {
        setConnectionStatus('Sending test summary prompt...');
        const result = await generateSummaryWithSelectedBackend({
            items: [],
            selectedText: 'User: We arrived at the old station.\nCharacter: Mira promised to guard the door while we searched for the map.',
            systemPrompt: 'You are a concise summarizer. Output only a summary.',
            userPrompt: 'Summarize this test chat in one sentence:\nUser: We arrived at the old station.\nCharacter: Mira promised to guard the door while we searched for the map.',
            maxTokens: 128,
            allowChunk: false,
        });
        setConnectionStatus(`Test response: ${result.slice(0, 240)}`, 'success');
        toast('success', 'Test summary prompt succeeded.');
    } catch (error) {
        const message = String(error.message || error);
        setConnectionStatus(message, 'error');
        toast('error', message);
    }
}

function bindSettingsControls() {
    const s = settings();
    $('#summary_resize_api_mode').val(s.apiMode);
    $('#summary_resize_language').val(s.language);
    $('#summary_resize_detail_level').val(s.detailLevel);
    $('#summary_resize_output_mode').val(s.outputMode);
    $('#summary_resize_replace_strategy').val(s.replaceStrategy);
    $('#summary_resize_backup_behavior').val(s.backupBehavior);
    $('#summary_resize_author_name').val(s.authorName);
    $('#summary_resize_dry_run').prop('checked', !!s.dryRun);
    $('#summary_resize_lm_base_url').val(s.lmStudioBaseUrl);
    $('#summary_resize_lm_model').val(s.lmStudioModel);
    $('#summary_resize_oai_base_url').val(s.openAiCompatibleBaseUrl);
    $('#summary_resize_oai_api_key').val(s.openAiCompatibleApiKey);
    $('#summary_resize_oai_model').val(s.openAiCompatibleModel);
    $('#summary_resize_llama_base_url').val(s.llamaCppBaseUrl);
    $('#summary_resize_llama_model').val(s.llamaCppModel);
    $('#summary_resize_llama_context_threshold').val(s.llamaCppContextWarningThreshold);
    $('#summary_resize_temperature').val(s.temperature);
    $('#summary_resize_timeout').val(s.requestTimeoutMs);
    $('#summary_resize_max_retries').val(s.maxRetries);
    $('#summary_resize_chunked').prop('checked', !!s.chunkedSummarization);
    $('#summary_resize_chunk_limit').val(s.chunkCharacterLimit);
    $('#summary_resize_tokens_very_short').val(s.maxTokensVeryShort);
    $('#summary_resize_tokens_short').val(s.maxTokensShort);
    $('#summary_resize_tokens_medium').val(s.maxTokensMedium);
    $('#summary_resize_tokens_detailed').val(s.maxTokensDetailed);
    updateBackendSettingsVisibility();

    $('#summary_resize_chat_settings').off(EVENT_NS);
    $('#summary_resize_chat_settings').on(`change${EVENT_NS} input${EVENT_NS}`, 'select,input', event => {
        const next = settings();
        const id = event.target.id;
        if (id === 'summary_resize_api_mode') next.apiMode = event.target.value;
        if (id === 'summary_resize_language') next.language = event.target.value;
        if (id === 'summary_resize_detail_level') next.detailLevel = event.target.value;
        if (id === 'summary_resize_output_mode') next.outputMode = event.target.value;
        if (id === 'summary_resize_replace_strategy') next.replaceStrategy = event.target.value;
        if (id === 'summary_resize_backup_behavior') next.backupBehavior = event.target.value;
        if (id === 'summary_resize_author_name') next.authorName = event.target.value || 'Summary';
        if (id === 'summary_resize_dry_run') next.dryRun = !!event.target.checked;
        if (id === 'summary_resize_lm_base_url') next.lmStudioBaseUrl = event.target.value;
        if (id === 'summary_resize_lm_model') next.lmStudioModel = event.target.value;
        if (id === 'summary_resize_oai_base_url') next.openAiCompatibleBaseUrl = event.target.value;
        if (id === 'summary_resize_oai_api_key') next.openAiCompatibleApiKey = event.target.value;
        if (id === 'summary_resize_oai_model') next.openAiCompatibleModel = event.target.value;
        if (id === 'summary_resize_llama_base_url') next.llamaCppBaseUrl = event.target.value;
        if (id === 'summary_resize_llama_model') next.llamaCppModel = event.target.value;
        if (id === 'summary_resize_llama_context_threshold') next.llamaCppContextWarningThreshold = Number(event.target.value) || DEFAULT_SETTINGS.llamaCppContextWarningThreshold;
        if (id === 'summary_resize_temperature') next.temperature = Number(event.target.value);
        if (id === 'summary_resize_timeout') next.requestTimeoutMs = Number(event.target.value) || DEFAULT_SETTINGS.requestTimeoutMs;
        if (id === 'summary_resize_max_retries') next.maxRetries = Number(event.target.value) || 0;
        if (id === 'summary_resize_chunked') next.chunkedSummarization = !!event.target.checked;
        if (id === 'summary_resize_chunk_limit') next.chunkCharacterLimit = Number(event.target.value) || DEFAULT_SETTINGS.chunkCharacterLimit;
        if (id === 'summary_resize_tokens_very_short') next.maxTokensVeryShort = Number(event.target.value) || DEFAULT_SETTINGS.maxTokensVeryShort;
        if (id === 'summary_resize_tokens_short') next.maxTokensShort = Number(event.target.value) || DEFAULT_SETTINGS.maxTokensShort;
        if (id === 'summary_resize_tokens_medium') next.maxTokensMedium = Number(event.target.value) || DEFAULT_SETTINGS.maxTokensMedium;
        if (id === 'summary_resize_tokens_detailed') next.maxTokensDetailed = Number(event.target.value) || DEFAULT_SETTINGS.maxTokensDetailed;
        if (id === 'summary_resize_api_mode') updateBackendSettingsVisibility();
        saveSettings();
    });
    $('#summary_resize_start_button').off(EVENT_NS).on(`click${EVENT_NS}`, enterSelectionMode);
    $('#summary_resize_export_button').off(EVENT_NS).on(`click${EVENT_NS}`, exportSelection);
    $('#summary_resize_test_connection').off(EVENT_NS).on(`click${EVENT_NS}`, testConnectionForCurrentBackend);
    $('#summary_resize_refresh_models').off(EVENT_NS).on(`click${EVENT_NS}`, async () => {
        try {
            await refreshModelsForCurrentBackend();
        } catch (error) {
            const message = String(error.message || error);
            setConnectionStatus(message, 'error');
            toast('error', message);
        }
    });
    $('#summary_resize_send_test_prompt').off(EVENT_NS).on(`click${EVENT_NS}`, sendTestSummaryPrompt);
}

function addWandButton() {
    if (!$('#extensionsMenu').length) return;
    let button = $('#summary_resize_wand_button');
    if (!button.length) {
        button = $('<div id="summary_resize_wand_button" class="interactable" tabindex="0" role="button"></div>');
        $('#extensionsMenu').append(button);
    }
    button
        .removeClass('extensionsMenuExtensionButton')
        .addClass('interactable')
        .attr({ tabindex: '0', role: 'button' })
        .empty()
        .append($('<div class="fa-solid fa-wand-magic-sparkles extensionsMenuExtensionButton"></div>'))
        .append($('<span></span>').text('Summarize Chat'));
    button.off(EVENT_NS);
    button.on(`click${EVENT_NS} keydown${EVENT_NS}`, event => {
        if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        $('#extensionsMenu').hide();
        enterSelectionMode();
    });
}

function bindGlobalEvents() {
    $(document).off(EVENT_NS);
    $(document).on(`click${EVENT_NS}`, '#chat .mes', event => {
        if (!state.selectionMode) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const id = Number(event.currentTarget.getAttribute('mesid'));
        toggleMessageSelection(id, event);
    });
    $(document).on(`click${EVENT_NS}`, '#summary_resize_toolbar_summarize', summarizeSelection);
    $(document).on(`click${EVENT_NS}`, '#summary_resize_toolbar_clear', clearSelection);
    $(document).on(`click${EVENT_NS}`, '#summary_resize_toolbar_cancel', exitSelectionMode);
    $(document).on(`keydown${EVENT_NS}`, event => {
        if (event.key === 'Escape' && state.selectionMode) {
            event.preventDefault();
            exitSelectionMode();
        }
    });

    const context = getContext();
    if (window.summaryResizeChatExtension.chatChangedHandler && context.eventSource?.removeListener) {
        context.eventSource.removeListener(context.eventTypes.CHAT_CHANGED, window.summaryResizeChatExtension.chatChangedHandler);
    }
    window.summaryResizeChatExtension.chatChangedHandler = () => {
        if (state.selectionMode) exitSelectionMode();
    };
    context.eventSource?.on?.(context.eventTypes.CHAT_CHANGED, window.summaryResizeChatExtension.chatChangedHandler);
}

jQuery(async () => {
    settings();
    bindGlobalEvents();
    await renderSettings();
    addWandButton();
    const context = getContext();
    if (window.summaryResizeChatExtension.appReadyHandler && context.eventSource?.removeListener) {
        context.eventSource.removeListener(context.eventTypes.APP_READY, window.summaryResizeChatExtension.appReadyHandler);
    }
    window.summaryResizeChatExtension.appReadyHandler = () => {
        addWandButton();
    };
    context.eventSource?.on?.(context.eventTypes.APP_READY, window.summaryResizeChatExtension.appReadyHandler);
    setTimeout(addWandButton, 1000);
});
