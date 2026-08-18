/**
 * 💅🔥 SLAY Images — Inline Image Generation + Wardrobe + Gallery
 * by Wewwa (https://github.com/wewwaistyping) — tg: @wewwajai
 *
 * Copyright (C) 2026  Wewwa (https://github.com/wewwaistyping)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * Built on prior work by:
 *   0xl0cal  — sillyimages (original inline image generation)
 *   delidgi  — sillyimages wardrobe fork (wardrobe system, outfit management,
 *              auto-analyze, avatar references, image context, video support)
 *   aceeenvw — notsosillynotsoimages (NPC reference system, iOS support,
 *              recursion protection, lightbox, debug logging) — AGPL-3.0,
 *              which is why this project carries the same licence
 *   hydall   — style gallery
 */
const SLAY_VERSION = '4.4.0-beta.1';

/* ╔═══════════════════════════════════════════════════════════════╗
   ║  MODULE 1: SlayWardrobe                                       ║
   ╚═══════════════════════════════════════════════════════════════╝ */

(function initWardrobe() {
    'use strict';
    const SW = 'slay_wardrobe';

    function uid() { return Date.now().toString(36) + Math.random().toString(36).substring(2, 8); }
    function swLog(l, ...a) { (l === 'ERROR' ? console.error : l === 'WARN' ? console.warn : console.log)('[SW]', ...a); }
    // textContent→innerHTML escapes &, < and > but NOT quotes, because the HTML
    // serializer only escapes quotes in attribute mode. esc() is interpolated into
    // quoted attributes in 8 places, so a quote in the value closed the attribute
    // early and everything after it parsed as real markup. Shared outfit cards made
    // that reachable by a third party: a crafted name or description executed code
    // in the SillyTavern page — API keys, chat history, requests as the user.
    // Escaping the two quote characters closes every one of those sites at once.
    function esc(t) {
        const d = document.createElement('div');
        d.textContent = t || '';
        return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ── Categories & Tags ──
    const CATEGORIES = Object.freeze({
        full: 'Полный',
        top: 'Верх',
        bottom: 'Низ',
        shoes: 'Обувь',
        accessories: 'Аксессуары',
        hair: 'Причёска',
    });
    const CAT_KEYS = Object.keys(CATEGORIES);
    const TAGS = Object.freeze({
        street: 'Улица',
        home: 'Дом',
        evening: 'Вечер',
        sleep: 'Сон',
        sport: 'Спорт',
        beach: 'Пляж',
        other: 'Другое',
    });
    const TAG_KEYS = Object.keys(TAGS);

    // No U+FE0F: that selector forces EMOJI presentation, and iOS then draws a
    // full-colour glyph that is wider, taller and on a different baseline than the
    // plain symbol — which is why the ♀ badge sat crooked on card corners while
    // unisex (which never had the selector) looked fine. Text presentation for all three.
    const GENDERS = Object.freeze({ unisex: '⚥', female: '♀', male: '♂' });
    const GENDER_KEYS = Object.keys(GENDERS);
    const GENDER_COLORS = Object.freeze({ unisex: '#a855f7', female: '#f472b6', male: '#60a5fa' });

    // ── Defaults (v4 — global items, per-character active outfits) ──
    const swDefaults = Object.freeze({
        items: [],
        activeOutfits: {},
        // Master switch for the wardrobe, deliberately INDEPENDENT of the
        // image-generation toggle: the outfit description reaches the prompt
        // through this module's own hooks, so the wardrobe is fully usable as a
        // pure outfit tracker with generation off and no image API configured.
        wardrobeEnabled: true,
        maxDimension: 512,
        showFloatingBtn: false,
        autoDescribe: true,
        describeMode: 'direct',
        describeModel: '',
        describeEndpoint: '',
        describeKey: '',
        describePromptStyle: 'detailed',
        describeManualModel: false,   // see manualModel in the main settings
        sendOutfitDescription: true,
        sendOutfitImageBot: true,
        sendOutfitImageUser: true,
        experimentalCollage: false,
        skipDescriptionWarning: false,
        // v4.1 UX additions
        modalWidth: 'normal',   // compact | normal | wide | xwide | full
        showHidden: false,      // toggle to show hidden items in grid
        tagsCollapsed: false,   // collapse the tag-filter row (funnel toggle in category row)
    });

    // Map preset -> pixel width (used as CSS var --sw-modal-width)
    const MODAL_WIDTH_MAP = Object.freeze({
        compact: '480px',
        normal: '560px',
        wide: '800px',
        xwide: '1100px',
        full: '96vw',
    });
    function swApplyModalWidth() {
        const s = swGetSettings();
        const val = MODAL_WIDTH_MAP[s.modalWidth] || MODAL_WIDTH_MAP.normal;
        document.documentElement.style.setProperty('--sw-modal-width', val);
    }

    function swGetSettings() {
        const ctx = SillyTavern.getContext();
        if (!ctx.extensionSettings[SW]) ctx.extensionSettings[SW] = structuredClone(swDefaults);
        const s = ctx.extensionSettings[SW];
        for (const k of Object.keys(swDefaults)) if (!Object.hasOwn(s, k)) s[k] = swDefaults[k];
        if (!Array.isArray(s.items)) s.items = [];
        if (!s.activeOutfits || typeof s.activeOutfits !== 'object') s.activeOutfits = {};
        swMigrate(s);
        return s;
    }
    function swSave() { SillyTavern.getContext().saveSettingsDebounced(); }

    // ── Migration from v3 (per-character wardrobes) to v4 (global items) ──
    function swMigrate(s) {
        if (!s.wardrobes) return;
        swLog('INFO', 'Migrating v3 wardrobes to v4 global items...');
        for (const charName of Object.keys(s.wardrobes)) {
            const w = s.wardrobes[charName];
            for (const type of ['bot', 'user']) {
                if (!Array.isArray(w[type])) continue;
                for (const old of w[type]) {
                    if (s.items.find(i => i.id === old.id)) continue;
                    s.items.push({
                        id: old.id,
                        name: old.name || 'Unnamed',
                        description: old.description || '',
                        imagePath: old.imagePath || '',
                        base64: old.base64 || '',
                        category: 'full',
                        tags: [],
                        addedAt: old.addedAt || Date.now(),
                    });
                }
                // Migrate active outfit references
                const oldActive = s.activeOutfits?.[charName];
                if (oldActive && (oldActive.bot === undefined || typeof oldActive.bot === 'string' || oldActive.bot === null)) {
                    const oldBotId = oldActive.bot || null;
                    const oldUserId = oldActive.user || null;
                    s.activeOutfits[charName] = swMakeCharOutfit(oldBotId, oldUserId);
                }
            }
        }
        delete s.wardrobes;
        swSave();
        swLog('INFO', 'Migration complete');
    }

    function swMakeCharOutfit(botFullId, userFullId) {
        return {
            mode: 'full',
            bot: { full: botFullId || null, top: null, bottom: null, shoes: null, accessories: null, hair: null },
            user: { full: userFullId || null, top: null, bottom: null, shoes: null, accessories: null, hair: null },
        };
    }

    function swCharName() {
        const ctx = SillyTavern.getContext();
        return (ctx.characterId !== undefined && ctx.characters?.[ctx.characterId]) ? (ctx.characters[ctx.characterId].name || '') : '';
    }

    // ── Item accessors (global) ──
    function swFindItem(id) { return swGetSettings().items.find(o => o.id === id) || null; }
    function swAddItem(item) { swGetSettings().items.push(item); swSave(); }
    function swToggleHidden(id) {
        const o = swFindItem(id); if (!o) return;
        o.hidden = !o.hidden;
        swSave();
    }
    function swToggleFavourite(id) {
        const o = swFindItem(id); if (!o) return;
        o.favourite = !o.favourite;
        swSave();
    }
    function swRemoveItem(id) {
        const s = swGetSettings();
        // Take the file with the item. Deleting an outfit used to leave its
        // picture on disk forever — the one fair complaint we got about clutter.
        const doomed = s.items.find(o => o.id === id);
        if (doomed?.imagePath) swDeleteImageFile(doomed.imagePath, { ignoreItemId: id });
        s.items = s.items.filter(o => o.id !== id);
        // Clear from all active outfits
        for (const cn of Object.keys(s.activeOutfits)) {
            const co = s.activeOutfits[cn];
            for (const type of ['bot', 'user']) {
                if (!co[type]) continue;
                for (const cat of CAT_KEYS) {
                    if (co[type][cat] === id) co[type][cat] = null;
                }
            }
        }
        swSave();
        swUpdatePromptInjection();
    }

    // ── Per-character active outfit ──
    function swGetCharOutfit() {
        const cn = swCharName();
        if (!cn) return null;
        const s = swGetSettings();
        if (!s.activeOutfits[cn]) s.activeOutfits[cn] = swMakeCharOutfit(null, null);
        const co = s.activeOutfits[cn];
        // Ensure structure
        if (!co.bot) co.bot = { full: null, top: null, bottom: null, shoes: null, accessories: null, hair: null };
        if (!co.user) co.user = { full: null, top: null, bottom: null, shoes: null, accessories: null, hair: null };
        if (!co.botMode) co.botMode = co.mode || 'full';
        if (!co.userMode) co.userMode = co.mode || 'full';
        return co;
    }

    function swGetSlot(type, cat) {
        const co = swGetCharOutfit();
        return co ? (co[type]?.[cat] || null) : null;
    }

    function swSetSlot(type, cat, id) {
        const cn = swCharName();
        if (!cn) { toastr.error('Персонаж не выбран', 'Гардероб'); return false; }
        const co = swGetCharOutfit();
        co[type][cat] = id;
        // Track lastWornAt per figure (bot/user) so Quick-Swap can rank by "last
        // worn on THIS figure" — users may have different relevant history for
        // bot vs user. Also keep a global lastWornAt for back-compat / general sort.
        if (id) {
            const item = swFindItem(id);
            if (item) {
                const now = Date.now();
                item.lastWornAt = now;
                if (type === 'bot') item.lastWornAtBot = now;
                else if (type === 'user') item.lastWornAtUser = now;
            }
        }
        swSave();
        return true;
    }

    // Equip a full outfit from Quick-Swap. Unlike swSetSlot this:
    //   (a) forces mode=full on the target type
    //   (b) preserves parts (top/bottom/shoes/accessories/hair) intact so the user can
    //       switch back to "по частям" in the full wardrobe modal without losing data
    //   (c) updates lastWornAt + saves + re-renders the preview popup & fab badge
    function swQuickSwapFull(type, id) {
        const co = swGetCharOutfit();
        if (!co || !co[type]) return false;
        co[type].full = id;
        co[type + 'Mode'] = 'full';
        // Mirror swSetSlot's lastWornAt bump (global + per-figure)
        const item = swFindItem(id);
        if (item) {
            const now = Date.now();
            item.lastWornAt = now;
            if (type === 'bot') item.lastWornAtBot = now;
            else if (type === 'user') item.lastWornAtUser = now;
        }
        swSave();
        swInjectFloatingBtn();       // badge refresh
        swUpdatePromptInjection();
        return true;
    }

    // Pick the "topmost worn item" for the preview thumbnail.
    //   full mode  → the full item (if any)
    //   parts mode → first non-null in priority order: top → bottom → shoes
    //                → accessories → hair
    //   nothing equipped → null
    const SW_PARTS_PRIORITY = ['top', 'bottom', 'shoes', 'accessories', 'hair'];
    function swGetTopWornItem(type) {
        const co = swGetCharOutfit();
        if (!co || !co[type]) return null;
        const mode = swGetModeFor(type);
        if (mode === 'full') {
            const id = co[type].full;
            return id ? swFindItem(id) : null;
        }
        for (const cat of SW_PARTS_PRIORITY) {
            const id = co[type][cat];
            if (id) {
                const item = swFindItem(id);
                if (item) return item;
            }
        }
        return null;
    }

    // Count how many parts are currently worn (across bot+user). Used for FAB badge.
    // A full counts as 1 (regardless of how many categories it represents).
    function swCountWornParts() {
        const co = swGetCharOutfit();
        if (!co) return 0;
        let n = 0;
        for (const type of ['bot', 'user']) {
            const mode = swGetModeFor(type);
            if (mode === 'full') {
                if (co[type]?.full) n++;
            } else {
                for (const cat of SW_PARTS_PRIORITY) if (co[type]?.[cat]) n++;
            }
        }
        return n;
    }

    // Quick-Swap ranking:
    //   1. favourites first
    //   2. then by lastWornAt DESC (most recently worn higher)
    //   3. then by name ASC
    //   hidden items are excluded entirely
    // Rank for Quick-Swap, figure-aware:
    //   1. favourites first (shared across figures — single ⭐ flag on the item)
    //   2. then by lastWornAtBot or lastWornAtUser DESC (depending on `figure`).
    //      Falls back to global lastWornAt if per-figure stamp not yet set.
    //   3. then by name ASC
    //   hidden items are excluded entirely
    function swRankForQuickSwap(items, figure = 'user') {
        const stampKey = figure === 'bot' ? 'lastWornAtBot' : 'lastWornAtUser';
        return items
            .filter(o => !o.hidden)
            .sort((a, b) => {
                const af = a.favourite ? 1 : 0, bf = b.favourite ? 1 : 0;
                if (af !== bf) return bf - af;
                const aw = a[stampKey] || a.lastWornAt || 0;
                const bw = b[stampKey] || b.lastWornAt || 0;
                if (aw !== bw) return bw - aw;
                return String(a.name || '').localeCompare(String(b.name || ''));
            });
    }

    // Group full-category items by tag. Items without any tag land under 'other'.
    // Returns { [tagKey]: Item[] } with values ranked for the target figure so
    // "last worn on THIS figure" floats up (bot and user can have different
    // relevant histories).
    function swGroupFullsByTag(figure = 'user') {
        const all = swGetSettings().items.filter(o => o.category === 'full');
        const byTag = {};
        for (const tk of TAG_KEYS) byTag[tk] = [];
        for (const item of all) {
            const tags = Array.isArray(item.tags) ? item.tags : [];
            const targetTags = tags.length ? tags.filter(t => TAG_KEYS.includes(t)) : ['other'];
            for (const tk of targetTags) {
                if (!byTag[tk]) byTag[tk] = [];
                byTag[tk].push(item);
            }
        }
        for (const tk of TAG_KEYS) byTag[tk] = swRankForQuickSwap(byTag[tk], figure);
        return byTag;
    }

    function swSetMode(mode) {
        const co = swGetCharOutfit();
        if (!co) return;
        // Per-type mode: bot and user can have different modes
        const modeKey = swTab === 'bot' ? 'botMode' : 'userMode';
        co[modeKey] = mode;
        swSave();
    }

    function swGetMode() {
        const co = swGetCharOutfit();
        if (!co) return 'full';
        return swTab === 'bot' ? (co.botMode || 'full') : (co.userMode || 'full');
    }

    function swGetModeFor(type) {
        const co = swGetCharOutfit();
        if (!co) return 'full';
        return type === 'bot' ? (co.botMode || 'full') : (co.userMode || 'full');
    }

    function swIsCatBlocked(mode, cat) {
        if (mode === 'full') return ['top', 'bottom', 'shoes'].includes(cat);
        if (mode === 'parts') return cat === 'full';
        return false;
    }

    // Accepts a File/Blob OR an already-read data: URL string. Prefer passing a
    // data URL captured at file-pick time: on Android a File is a content://
    // handle that can expire while a form modal is open — reading it later
    // fails with a bare FileReader error (the "Ошибка: read" reports).
    function swResize(src, maxDim) {
        return new Promise((res, rej) => {
            const go = (dataUrl) => {
                const img = new Image();
                img.onload = () => {
                    let { width: w, height: h } = img;
                    if (w > maxDim || h > maxDim) { const s = Math.min(maxDim / w, maxDim / h); w = Math.round(w * s); h = Math.round(h * s); }
                    const c = document.createElement('canvas'); c.width = w; c.height = h;
                    const cx = c.getContext('2d', { willReadFrequently: true });
                    cx.drawImage(img, 0, 0, w, h);
                    // Outfit shots are photographs; storing them losslessly cost ~450KB
                    // where JPEG costs ~50KB — paid again on every upload, every describe
                    // download and every wardrobe open, which hurts on mobile data.
                    // Keep PNG only when the image actually uses transparency (a cut-out
                    // garment on a clear background), which we can just look at.
                    let opaque = true;
                    try {
                        const d = cx.getImageData(0, 0, w, h).data;
                        for (let i = 3; i < d.length; i += 4) { if (d[i] !== 255) { opaque = false; break; } }
                    } catch (e) { opaque = false; }   // tainted canvas → play it safe
                    const fmt = opaque ? 'jpeg' : 'png';
                    res({ base64: c.toDataURL(`image/${fmt}`, opaque ? 0.85 : undefined).split(',')[1], format: fmt });
                };
                img.onerror = () => rej(new Error('не удалось декодировать картинку (битый файл или формат не поддерживается)'));
                img.src = dataUrl;
            };
            if (typeof src === 'string') { go(src); return; }
            const r = new FileReader();
            r.onload = (e) => go(e.target.result);
            r.onerror = () => rej(new Error('не удалось прочитать файл — выберите его заново'));
            r.readAsDataURL(src);
        });
    }

    function swBytesToBase64(bytes) {
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(bin);
    }

    // ── Save wardrobe image to server file ──
    // Delete a wardrobe image from disk. Nothing in this extension ever removed
    // a file before: deleting an item, replacing its picture or regenerating it
    // all left the old file behind forever. Refuses to touch a path that is
    // still referenced by another item, and never throws — losing the file is
    // not worth failing the user's action over.
    async function swDeleteImageFile(imagePath, { ignoreItemId = null } = {}) {
        try {
            if (!imagePath || !imagePath.includes('/wardrobe_refs/')) return false;
            const stillUsed = swGetSettings().items.some(o => o.id !== ignoreItemId && o.imagePath === imagePath);
            if (stillUsed) { swLog('INFO', `Not deleting ${imagePath} — another item still uses it`); return false; }
            const ctx = SillyTavern.getContext();
            const r = await fetch('/api/images/delete', {
                method: 'POST', headers: ctx.getRequestHeaders(),
                body: JSON.stringify({ path: imagePath.replace(/^\//, '') })
            });
            if (r.ok) { swLog('INFO', `Deleted wardrobe image: ${imagePath}`); return true; }
            swLog('WARN', `Delete failed (${r.status}) for ${imagePath}`);
            return false;
        } catch (e) { swLog('WARN', 'swDeleteImageFile failed:', e?.message); return false; }
    }

    async function swSaveImageToFile(base64, label, format = 'png') {
        const ctx = SillyTavern.getContext();
        const safeName = label.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
        const filename = `wardrobe_${safeName}_${Date.now()}`;
        const response = await fetch('/api/images/upload', {
            method: 'POST', headers: ctx.getRequestHeaders(),
            body: JSON.stringify({ image: base64, format: format === 'jpeg' ? 'jpg' : 'png', ch_name: 'wardrobe_refs', filename })
        });
        if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
        const result = await response.json();
        swLog('INFO', `Wardrobe image saved: ${result.path}`);
        return result.path;
    }

    // ── Load wardrobe image from server path -> base64 ──
    async function swLoadImageAsBase64(path) {
        try {
            const response = await fetch(path);
            if (!response.ok) return null;
            const blob = await response.blob();
            return await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (e) { swLog('WARN', `swLoadImageAsBase64 failed: ${path}`, e.message); return null; }
    }

    // ── Get outfit image src for display (path preferred, base64 fallback) ──
    function swGetOutfitSrc(outfit) {
        if (outfit.imagePath) return outfit.imagePath;
        if (outfit.base64) return `data:image/png;base64,${outfit.base64}`;
        return '';
    }

    // ── Collage builder: merge parts into one image ──
    // Get all parts images for a type (bot/user). Returns array of base64 strings.
    async function swGetPartsImages(type) {
        const co = swGetCharOutfit();
        if (!co) return [];
        const mode = swGetModeFor(type);
        if (mode !== 'parts') return [];

        const slots = ['top', 'bottom', 'shoes', 'accessories', 'hair'];
        const images = [];
        for (const cat of slots) {
            const itemId = co[type]?.[cat];
            if (!itemId) continue;
            const item = swFindItem(itemId);
            if (!item) continue;
            let b64 = null;
            if (item.imagePath) b64 = await swLoadImageAsBase64(item.imagePath);
            if (!b64 && item.base64) b64 = item.base64;
            if (b64) images.push(b64);
        }
        return images;
    }

    async function swBuildCollage(type) {
        const images = await swGetPartsImages(type);
        if (images.length < 2) return null; // 1 item = send as single ref, not collage
        const collageImages = images.slice(0, 6); // max 6

        return new Promise((resolve) => {
            const size = 512;
            const canvas = document.createElement('canvas');
            canvas.width = size; canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, 0, size, size);
            const count = collageImages.length;
            let cols, rows;
            if (count <= 2) { cols = 2; rows = 1; }
            else if (count <= 4) { cols = 2; rows = 2; }
            else { cols = 3; rows = 2; }
            const cellW = Math.floor(size / cols);
            const cellH = Math.floor(size / rows);
            let loaded = 0;
            collageImages.forEach((b64, idx) => {
                const img = new Image();
                img.onload = () => {
                    const col = idx % cols; const row = Math.floor(idx / cols);
                    const x = col * cellW; const y = row * cellH;
                    const scale = Math.max(cellW / img.width, cellH / img.height);
                    const sw = cellW / scale; const sh = cellH / scale;
                    const sx = (img.width - sw) / 2; const sy = (img.height - sh) / 2;
                    ctx.drawImage(img, sx, sy, sw, sh, x, y, cellW, cellH);
                    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
                    ctx.strokeRect(x, y, cellW, cellH);
                    loaded++;
                    if (loaded === collageImages.length) {
                        const result = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
                        swLog('INFO', `Collage built: ${count} images, ${cols}x${rows}, ~${Math.round(result.length / 1024)}KB`);
                        resolve(result);
                    }
                };
                img.onerror = () => { loaded++; if (loaded === collageImages.length) resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]); };
                img.src = `data:image/png;base64,${b64}`;
            });
        });
    }

    // ── Inline styles for new v4 elements ──
    function swInjectV4Styles() {
        if (document.getElementById('sw-v4-styles')) return;
        const style = document.createElement('style');
        style.id = 'sw-v4-styles';
        style.textContent = `
            .sw-mode-switch { display:flex; gap:6px; padding:4px 12px; }
            .sw-mode-btn { padding:5px 14px; border-radius:16px; cursor:pointer; font-size:13px; border:1px solid rgba(255,255,255,0.15); background:rgba(255,255,255,0.05); color:#ccc; transition:all .2s; user-select:none; }
            .sw-mode-btn:hover { background:rgba(255,255,255,0.1); }
            .sw-mode-btn-active { background:rgba(219,112,147,0.25); color:#f0a0c0; border-color:rgba(219,112,147,0.5); }
            .sw-mode-btn-active:hover { background:rgba(219,112,147,0.35); }

            .sw-cat-tabs { display:flex; gap:4px; padding:4px 12px; flex-wrap:wrap; }
            .sw-cat-tab { position:relative; padding:4px 12px; border-radius:14px; cursor:pointer; font-size:12px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.04); color:#aaa; transition:all .2s; user-select:none; }
            .sw-cat-tab:hover { background:rgba(255,255,255,0.08); }
            .sw-cat-tab-active { background:rgba(219,112,147,0.2); color:#f0a0c0; border-color:rgba(219,112,147,0.4); }
            .sw-cat-tab-blocked { opacity:0.35; pointer-events:none; }
            .sw-cat-dot { position:absolute; top:2px; right:4px; width:6px; height:6px; border-radius:50%; background:#db7093; display:none; }
            .sw-cat-dot-visible { display:block; }
            .sw-tagfilter-toggle { margin-left:auto; display:inline-flex; align-items:center; gap:5px; padding:4px 11px; border-radius:14px; cursor:pointer; font-size:12px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.04); color:#aaa; transition:all .2s; user-select:none; }
            .sw-tagfilter-toggle:hover { background:rgba(255,255,255,0.08); color:#ccc; }
            .sw-tagfilter-toggle.sw-tagfilter-on { background:rgba(219,112,147,0.2); color:#f0a0c0; border-color:rgba(219,112,147,0.4); }
            .sw-tagfilter-badge { font-size:11px; line-height:1; padding:1px 6px; border-radius:8px; background:rgba(219,112,147,0.35); color:#fbe3ee; max-width:80px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            .sw-img-missing { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px; cursor:pointer; background:rgba(255,255,255,0.03); border:1px dashed rgba(244,114,182,0.4); border-radius:8px; color:#caa; text-align:center; padding:6px; box-sizing:border-box; }
            .sw-img-missing i { font-size:26px; color:rgba(244,114,182,0.7); }
            .sw-img-missing span { font-size:11px; color:#b89; line-height:1.2; }
            .sw-img-missing .sw-img-missing-hint { font-size:10px; color:rgba(244,114,182,0.85); }

            .sw-tag-filter { display:flex; gap:4px; padding:4px 12px; flex-wrap:wrap; }
            .sw-tag-chip { padding:3px 10px; border-radius:12px; cursor:pointer; font-size:11px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.03); color:#999; transition:all .2s; user-select:none; }
            .sw-tag-chip:hover { background:rgba(255,255,255,0.07); }
            .sw-tag-chip-active { background:rgba(147,197,219,0.2); color:#a0d0f0; border-color:rgba(147,197,219,0.4); }

            .sw-current-outfit { padding:8px 12px; border-top:1px solid rgba(255,255,255,0.08); flex-shrink:0; }
            .sw-current-title { font-size:12px; color:#888; margin-bottom:6px; }
            .sw-current-slots { display:flex; gap:6px; flex-wrap:wrap; align-items:flex-start; }
            .sw-current-slot { display:flex; flex-direction:column; align-items:center; gap:2px; min-width:52px; }
            .sw-current-slot-img { width:44px; height:44px; border-radius:8px; object-fit:cover; border:1px solid rgba(255,255,255,0.12); background:rgba(0,0,0,0.2); }
            .sw-current-slot-empty { width:44px; height:44px; border-radius:8px; border:1px dashed rgba(255,255,255,0.15); background:rgba(0,0,0,0.1); display:flex; align-items:center; justify-content:center; font-size:10px; color:#555; }
            .sw-current-slot-label { font-size:10px; color:#777; text-align:center; max-width:56px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            .sw-current-desc { font-size:11px; color:#999; margin-top:6px; line-height:1.4; max-height:60px; overflow-y:auto; }

            .sw-upload-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.75); z-index:200000; display:flex; align-items:flex-start; justify-content:center; overflow-y:auto; -webkit-overflow-scrolling:touch; padding:20px; padding-top:10vh; }
            @media (max-width:600px) { .sw-upload-modal-overlay { align-items:flex-start; padding-top:40px; } .sw-upload-modal { max-height:calc(100dvh - 60px); overflow-y:auto; } }
            @media (max-width:600px) { .sw-edit-modal-overlay { align-items:flex-start; padding:16px; padding-top:40px; } .sw-edit-modal { max-height:calc(100dvh - 60px); overflow-y:auto; } }
            .sw-upload-modal { background:#2a2a2e; border-radius:14px; padding:20px; width:360px; max-width:90vw; max-height:80vh; overflow-y:auto; color:#ddd; box-shadow:0 8px 32px rgba(0,0,0,0.5); flex-shrink:0; }
            .sw-upload-modal h3 { margin:0 0 14px; font-size:15px; color:#f0a0c0; }
            .sw-upload-modal label { display:block; font-size:12px; color:#aaa; margin:10px 0 4px; }
            .sw-upload-modal input[type="text"] { width:100%; padding:7px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.15); background:rgba(0,0,0,0.2); color:#eee; font-size:13px; box-sizing:border-box; }
            .sw-upload-modal select { width:100%; padding:7px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.15); background:rgba(0,0,0,0.2); color:#eee; font-size:13px; box-sizing:border-box; }
            .sw-upload-tags { display:flex; flex-wrap:wrap; gap:6px; margin-top:4px; }
            .sw-upload-tag { display:flex; align-items:center; gap:3px; font-size:12px; color:#bbb; cursor:pointer; user-select:none; }
            .sw-upload-tag input { accent-color:#db7093; }
            .sw-upload-btns { display:flex; gap:8px; margin-top:16px; justify-content:flex-end; }
            .sw-upload-btn { padding:7px 18px; border-radius:10px; border:none; cursor:pointer; font-size:13px; }
            .sw-upload-btn-cancel { background:rgba(255,255,255,0.08); color:#aaa; }
            .sw-upload-btn-cancel:hover { background:rgba(255,255,255,0.14); }
            .sw-upload-btn-save { background:rgba(219,112,147,0.3); color:#f0a0c0; }
            .sw-upload-btn-save:hover { background:rgba(219,112,147,0.45); }

            .sw-edit-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.75); z-index:200000; display:flex; align-items:flex-start; justify-content:center; overflow-y:auto; -webkit-overflow-scrolling:touch; padding:20px; padding-top:10vh; }
            .sw-edit-modal { background:#2a2a2e; border-radius:14px; padding:20px; width:380px; max-width:90vw; max-height:80vh; overflow-y:auto; color:#ddd; box-shadow:0 8px 32px rgba(0,0,0,0.5); flex-shrink:0; }
            .sw-edit-modal h3 { margin:0 0 14px; font-size:15px; color:#f0a0c0; }
            .sw-edit-modal label { display:block; font-size:12px; color:#aaa; margin:10px 0 4px; }
            .sw-edit-modal input[type="text"], .sw-edit-modal textarea { width:100%; padding:7px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.15); background:rgba(0,0,0,0.2); color:#eee; font-size:13px; box-sizing:border-box; }
            .sw-edit-modal textarea { min-height:60px; resize:vertical; }
            .sw-edit-modal select { width:100%; padding:7px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.15); background:rgba(0,0,0,0.2); color:#eee; font-size:13px; box-sizing:border-box; }
        `;
        document.head.appendChild(style);
    }

    // ── Modal state ──
    let swOpen = false, swTab = 'bot', swCatTab = 'full', swTagFilter = null, swForWhoFilter = null, swGenderFilter = null, swFavFilter = false;

    function swOpenModal() {
        swCloseModal();
        swInjectV4Styles();
        swApplyModalWidth();
        swOpen = true;
        const cn = swCharName();
        if (!cn) { toastr.warning('Выберите персонажа', 'Гардероб'); swOpen = false; return; }

        const ov = document.createElement('div'); ov.id = 'sw-modal-overlay';
        ov.addEventListener('click', (e) => { if (e.target === ov) swCloseModal(); });

        const co = swGetCharOutfit();
        const s = swGetSettings();
        const hiddenCount = (s.items || []).filter(o => o.hidden).length;
        const m = document.createElement('div'); m.id = 'sw-modal';
        m.innerHTML = `
            <div class="sw-modal-header">
                <span>\uD83D\uDC85 Гардероб — <b>${esc(cn)}</b>
                    <label class="sw-header-toggle ${s.showHidden ? 'sw-header-toggle-active' : ''}" id="sw-show-hidden-toggle" title="Показать скрытые">
                        <i class="fa-solid fa-eye${s.showHidden ? '' : '-slash'}"></i> Скрытые: ${hiddenCount}
                    </label>
                </span>
                <div class="sw-modal-close" title="Закрыть"><i class="fa-solid fa-xmark"></i></div>
            </div>
            <div class="sw-tabs" id="sw-type-tabs">
                <div class="sw-tab ${swTab === 'bot' ? 'sw-tab-active' : ''}" data-tab="bot">Бот</div>
                <div class="sw-tab ${swTab === 'user' ? 'sw-tab-active' : ''}" data-tab="user">Юзер</div>
            </div>
            <div class="sw-mode-switch" id="sw-mode-switch"></div>
            <div class="sw-cat-tabs" id="sw-cat-tabs"></div>
            <div class="sw-tag-filter" id="sw-tag-filter"></div>
            <div class="sw-tag-filter" id="sw-forwho-filter"></div>
            <div class="sw-tab-content" id="sw-tab-content"></div>
            <div class="sw-current-outfit" id="sw-current-outfit"></div>`;

        ov.appendChild(m); document.body.appendChild(ov);
        m.querySelector('.sw-modal-close').addEventListener('click', swCloseModal);
        m.querySelector('#sw-show-hidden-toggle')?.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            const st = swGetSettings();
            st.showHidden = !st.showHidden;
            swSave();
            // Re-render: update toggle visual + re-filter grid
            const toggle = e.currentTarget;
            toggle.classList.toggle('sw-header-toggle-active', st.showHidden);
            toggle.querySelector('i').className = `fa-solid fa-eye${st.showHidden ? '' : '-slash'}`;
            swRender();
        });
        for (const t of m.querySelectorAll('#sw-type-tabs .sw-tab')) t.addEventListener('click', () => {
            swTab = t.dataset.tab;
            swForWhoFilter = swTab; // Auto-filter: Бот tab → show bot items, Юзер tab → show user items
            m.querySelectorAll('#sw-type-tabs .sw-tab').forEach(x => x.classList.toggle('sw-tab-active', x.dataset.tab === swTab));
            swRender();
        });
        swForWhoFilter = swTab; // Default filter to current tab
        swRender();
        document.addEventListener('keydown', swEsc);
    }
    // Innermost first: an open sub-form takes the Escape and the wardrobe stays
    // put. Same as the crop dialog, which already swallows its own Escape. A
    // second press then closes the wardrobe.
    function swEsc(e) {
        if (e.key !== 'Escape') return;
        if (swAbortInline()) { e.stopPropagation(); return; }
        swCloseModal();
    }
    function swCloseModal() {
        swOpen = false;
        // The ✕ and the backdrop mean "close the wardrobe", which takes any open
        // form with it — so say out loud that the upload was dropped. Otherwise the
        // panel just disappears and the item silently never arrives.
        swAbortInline({ notify: true });
        document.getElementById('sw-modal-overlay')?.remove();
        document.removeEventListener('keydown', swEsc);
    }

    // Header counter, needed both by a full render and by a single card flip.
    function swUpdateHiddenCount() {
        const hdrToggle = document.getElementById('sw-show-hidden-toggle');
        if (!hdrToggle) return;
        const hiddenCount = (swGetSettings().items || []).filter(o => o.hidden).length;
        const labelText = hdrToggle.childNodes[hdrToggle.childNodes.length - 1];
        if (labelText && labelText.nodeType === 3) labelText.textContent = ` Скрытые: ${hiddenCount}`;
    }

    // Repaint ONE card instead of the whole modal. Starring an outfit used to call
    // swRender(), which throws away every card and every binding to make a single
    // icon yellow — on a 60-outfit wardrobe that is six hundred listeners rebuilt
    // for one tap. A full render is still correct when the change pushes the item
    // out of the view it is sitting in, otherwise the card would stay put and look
    // like it had ignored the tap.
    function swApplyCornerToggle(card, o, kind) {
        const paint = (sel, on, title, iconClass) => {
            const btn = card.querySelector(sel);
            if (!btn) return;
            btn.classList.toggle('sw-corner-active', on);
            btn.title = title;
            const i = btn.querySelector('i');
            if (i) i.className = iconClass;
        };
        if (kind === 'fav') {
            if (swFavFilter && !o.favourite) { swRender(); return; }
            card.classList.toggle('sw-outfit-favourite', !!o.favourite);
            paint('.sw-corner-fav', !!o.favourite,
                o.favourite ? 'Убрать из избранного' : 'В избранное',
                `fa-${o.favourite ? 'solid' : 'regular'} fa-star`);
        } else {
            if (!swGetSettings().showHidden && o.hidden) { swRender(); return; }
            card.classList.toggle('sw-outfit-hidden', !!o.hidden);
            paint('.sw-corner-hide', !!o.hidden,
                o.hidden ? 'Показать' : 'Скрыть',
                `fa-solid fa-eye${o.hidden ? '-slash' : ''}`);
            swUpdateHiddenCount();
        }
    }

    function swRender() {
        const content = document.getElementById('sw-tab-content');
        // Never paint over a live form. Its Save/Cancel buttons are in this very
        // subtree; overwriting them without answering the form is what left the
        // import awaiting a reply that could no longer come.
        if (_savedContent !== null && content) { swAbortInline(); return; }
        const modeWrap = document.getElementById('sw-mode-switch');
        const catWrap = document.getElementById('sw-cat-tabs');
        const tagWrap = document.getElementById('sw-tag-filter');
        const currentWrap = document.getElementById('sw-current-outfit');
        if (!content) return;
        const cn = swCharName();
        const co = swGetCharOutfit();
        if (!co) return;
        const mode = swGetMode();

        // ── Mode switch ──
        if (modeWrap) {
            modeWrap.innerHTML = `
                <div class="sw-mode-btn ${mode === 'full' ? 'sw-mode-btn-active' : ''}" data-mode="full">\uD83D\uDC57 Полный комплект</div>
                <div class="sw-mode-btn ${mode === 'parts' ? 'sw-mode-btn-active' : ''}" data-mode="parts">\uD83E\uDDE9 По частям</div>`;
            for (const btn of modeWrap.querySelectorAll('.sw-mode-btn')) {
                btn.addEventListener('click', () => {
                    swSetMode(btn.dataset.mode);
                    swRender();
                    swUpdatePromptInjection();
                    swInjectFloatingBtn();
                });
            }
        }

        // Tag-row collapse state (persisted). Funnel toggle lives in the category
        // row; clicking it shows/hides the tag filter row to save vertical space
        // (esp. on mobile). Filtering still works while collapsed — the active
        // tag is shown as a badge on the funnel.
        const tagsCollapsed = !!swGetSettings().tagsCollapsed;
        const activeTagLabel = swTagFilter ? (TAGS[swTagFilter] || swTagFilter) : '';

        // ── Category tabs with dots ──
        if (catWrap) {
            let catHtml = '';
            for (const cat of CAT_KEYS) {
                const blocked = swIsCatBlocked(mode, cat);
                const active = swCatTab === cat;
                const equipped = !!(co[swTab]?.[cat]);
                catHtml += `<div class="sw-cat-tab ${active ? 'sw-cat-tab-active' : ''} ${blocked ? 'sw-cat-tab-blocked' : ''}" data-cat="${cat}">
                    ${esc(CATEGORIES[cat])}
                    <span class="sw-cat-dot ${equipped && !blocked ? 'sw-cat-dot-visible' : ''}"></span>
                </div>`;
            }
            // Funnel toggle, pushed to the right end of the category row. NOT a
            // .sw-cat-tab (so the category-click loop below ignores it).
            catHtml += `<div class="sw-tagfilter-toggle ${tagsCollapsed ? 'sw-tagfilter-on' : ''}" id="sw-tagfilter-toggle" title="Фильтр по тегам" role="button" aria-label="Показать/скрыть фильтр по тегам" aria-pressed="${tagsCollapsed ? 'true' : 'false'}">
                <i class="fa-solid fa-filter"></i>${tagsCollapsed && swTagFilter ? `<span class="sw-tagfilter-badge">${esc(activeTagLabel)}</span>` : ''}
            </div>`;
            catWrap.innerHTML = catHtml;
            // If current cat is blocked, switch to first available
            if (swIsCatBlocked(mode, swCatTab)) {
                swCatTab = CAT_KEYS.find(c => !swIsCatBlocked(mode, c)) || 'full';
                // Re-render cat tabs with corrected active
                swRender();
                return;
            }
            for (const tab of catWrap.querySelectorAll('.sw-cat-tab:not(.sw-cat-tab-blocked)')) {
                tab.addEventListener('click', () => {
                    swCatTab = tab.dataset.cat;
                    swRender();
                });
            }
            catWrap.querySelector('#sw-tagfilter-toggle')?.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                const s = swGetSettings();
                s.tagsCollapsed = !s.tagsCollapsed;
                swSave();
                swRender();
            });
        }

        // ── Tag filter ──
        if (tagWrap) {
            // Collapsed → hide the whole tag row (filtering still applies via swTagFilter).
            tagWrap.style.display = tagsCollapsed ? 'none' : '';
            let tagHtml = `<div class="sw-tag-chip ${swTagFilter === null ? 'sw-tag-chip-active' : ''}" data-tag="">Все</div>`;
            for (const tag of TAG_KEYS) {
                tagHtml += `<div class="sw-tag-chip ${swTagFilter === tag ? 'sw-tag-chip-active' : ''}" data-tag="${tag}">${esc(TAGS[tag])}</div>`;
            }
            tagWrap.innerHTML = tagHtml;
            for (const chip of tagWrap.querySelectorAll('.sw-tag-chip')) {
                chip.addEventListener('click', () => {
                    swTagFilter = chip.dataset.tag || null;
                    swRender();
                });
            }
        }

        // ── For who + gender filter (one row with divider) ──
        const forWhoWrap = document.getElementById('sw-forwho-filter');
        if (forWhoWrap) {
            const fwLabels = { '': 'Все', 'bot': '🤖 Бот', 'user': '👤 Юзер' };
            let fwHtml = '';
            for (const [key, label] of Object.entries(fwLabels)) {
                const active = (swForWhoFilter || '') === key;
                fwHtml += `<div class="sw-tag-chip ${active ? 'sw-tag-chip-active' : ''}" data-fw="${key}">${label}</div>`;
            }
            // Divider + gender chips
            fwHtml += `<div style="width:1px;background:rgba(255,255,255,0.1);margin:0 2px;flex-shrink:0;"></div>`;
            for (const g of GENDER_KEYS) {
                const active = (swGenderFilter || '') === g || (!swGenderFilter && g === 'unisex' && false);
                const noFilter = !swGenderFilter && g === 'unisex';
                fwHtml += `<div class="sw-tag-chip ${!swGenderFilter && g === GENDER_KEYS[0] ? '' : ''} ${swGenderFilter === g ? 'sw-tag-chip-active' : ''}" data-gender="${g}" style="${swGenderFilter === g ? 'border-color:' + GENDER_COLORS[g] + '40;color:' + GENDER_COLORS[g] + ';background:' + GENDER_COLORS[g] + '18;' : ''}">${GENDERS[g]}</div>`;
            }
            // "All genders" button
            fwHtml = fwHtml.replace('</div><div style="width:1px', `</div><div class="sw-tag-chip ${!swGenderFilter ? 'sw-tag-chip-active' : ''}" data-gender="" style="font-size:10px;">Все</div><div style="width:1px`);

            // Divider + favourites filter chip
            fwHtml += `<div style="width:1px;background:rgba(255,255,255,0.1);margin:0 2px;flex-shrink:0;"></div>`;
            fwHtml += `<div class="sw-tag-chip sw-fav-filter-chip ${swFavFilter ? 'sw-tag-chip-active' : ''}" data-fav-filter title="Показать только избранные"><i class="fa-solid fa-star" style="color:${swFavFilter ? '#fbbf24' : '#888'};"></i></div>`;

            forWhoWrap.innerHTML = fwHtml;
            for (const chip of forWhoWrap.querySelectorAll('.sw-tag-chip[data-fw]')) {
                chip.addEventListener('click', () => { swForWhoFilter = chip.dataset.fw || null; swRender(); });
            }
            for (const chip of forWhoWrap.querySelectorAll('.sw-tag-chip[data-gender]')) {
                chip.addEventListener('click', () => { swGenderFilter = chip.dataset.gender || null; swRender(); });
            }
            forWhoWrap.querySelector('[data-fav-filter]')?.addEventListener('click', () => { swFavFilter = !swFavFilter; swRender(); });
        }

        // ── Filter items by category + tag + forWho + gender + hidden ──
        const settings = swGetSettings();
        const allItems = settings.items;
        const showHidden = !!settings.showHidden;
        const filtered = allItems.filter(o => {
            if (o.category !== swCatTab) return false;
            if (swTagFilter && (!Array.isArray(o.tags) || !o.tags.includes(swTagFilter))) return false;
            if (swForWhoFilter && o.forWho && o.forWho !== 'all' && o.forWho !== swForWhoFilter) return false;
            if (swGenderFilter && (o.gender || 'unisex') !== swGenderFilter) return false;
            if (!showHidden && o.hidden) return false;
            if (swFavFilter && !o.favourite) return false;
            return true;
        });

        const equippedId = co[swTab]?.[swCatTab] || null;

        // ── Sort: equipped first → favourites → normal → hidden last ──
        filtered.sort((a, b) => {
            const aRank = (a.id === equippedId) ? 0 : (a.favourite ? 1 : (a.hidden ? 3 : 2));
            const bRank = (b.id === equippedId) ? 0 : (b.favourite ? 1 : (b.hidden ? 3 : 2));
            if (aRank !== bRank) return aRank - bRank;
            // Within same rank: newest first (by addedAt desc)
            return (b.addedAt || 0) - (a.addedAt || 0);
        });

        // ── Grid ──
        let h = '<div class="sw-outfit-grid"><div class="sw-outfit-card sw-upload-card" id="sw-upload-trigger"><div class="sw-upload-icon"><i class="fa-solid fa-plus"></i></div><span>Загрузить</span></div><div class="sw-outfit-card sw-upload-card" id="sw-import-trigger"><div class="sw-upload-icon"><i class="fa-solid fa-file-import"></i></div><span>Импорт</span></div>';
        for (const o of filtered) {
            const a = o.id === equippedId;
            const fav = !!o.favourite;
            const hid = !!o.hidden;
            const classes = ['sw-outfit-card'];
            if (a) classes.push('sw-outfit-active');
            if (fav) classes.push('sw-outfit-favourite');
            if (hid) classes.push('sw-outfit-hidden');
            const _src = swGetOutfitSrc(o);
            const _imgInner = _src
                ? `<img src="${_src}" alt="${esc(o.name)}" class="sw-outfit-img" loading="lazy">`
                : `<div class="sw-img-missing"><i class="fa-solid fa-image-slash"></i><span>картинка пропала</span><span class="sw-img-missing-hint">✏️ заменить</span></div>`;
            h += `<div class="${classes.join(' ')}" data-id="${o.id}">
                <div class="sw-outfit-img-wrap">
                    ${_imgInner}
                    ${a ? '<div class="sw-active-badge"><i class="fa-solid fa-check"></i></div>' : ''}
                    <button class="sw-corner-btn sw-corner-fav ${fav ? 'sw-corner-active' : ''}" data-act="fav" title="${fav ? 'Убрать из избранного' : 'В избранное'}"><i class="fa-${fav ? 'solid' : 'regular'} fa-star"></i></button>
                    <button class="sw-corner-btn sw-corner-hide ${hid ? 'sw-corner-active' : ''}" data-act="hide" title="${hid ? 'Показать' : 'Скрыть'}"><i class="fa-solid fa-eye${hid ? '-slash' : ''}"></i></button>
                    <div style="position:absolute;top:4px;left:4px;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;line-height:1;font-size:11px;border-radius:6px;background:rgba(0,0,0,0.5);color:${GENDER_COLORS[o.gender || 'unisex']};">${GENDERS[o.gender || 'unisex']}</div>
                </div>
                <div class="sw-outfit-footer"><span class="sw-outfit-name" title="${esc(o.description || o.name)}">${esc(o.name)}</span>
                    <div class="sw-outfit-btns">
                        <div class="sw-btn-activate" title="${a ? 'Снять' : 'Надеть'}"><i class="fa-solid ${a ? 'fa-toggle-on' : 'fa-toggle-off'}"></i></div>
                        <div class="sw-btn-edit" title="Редактировать"><i class="fa-solid fa-pen"></i></div>
                        <div class="sw-btn-regen" title="Перегенерировать описание"><i class="fa-solid fa-robot"></i></div>
                        <div class="sw-btn-delete" title="Удалить"><i class="fa-solid fa-trash-can"></i></div>
                    </div></div></div>`;
        }
        h += '</div>';
        content.innerHTML = h;

        swUpdateHiddenCount();

        // ONE listener for the entire grid, bound once and left alone. The old code
        // ran seven querySelector calls per card and hung ten closures on each —
        // and since swRender() rebuilds the grid on every filter tap, all of it was
        // thrown away and recreated each time a chip was touched.
        if (content.dataset.swDelegated !== '1') {
            content.dataset.swDelegated = '1';
            content.addEventListener('click', (e) => {
                const t = e.target;
                if (!t || !t.closest) return;
                const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };

                // The two upload tiles carry no data-id, so they are matched first.
                if (t.closest('#sw-upload-trigger')) { stop(); swUpload(); return; }
                if (t.closest('#sw-import-trigger')) { stop(); swUpload(true); return; }

                const card = t.closest('.sw-outfit-card[data-id]');
                if (!card) return;
                const id = card.dataset.id;

                // Corner buttons sit over the picture, so they are tested before it.
                if (t.closest('.sw-corner-fav')) {
                    stop(); swToggleFavourite(id);
                    const o = swFindItem(id); if (o) swApplyCornerToggle(card, o, 'fav');
                    return;
                }
                if (t.closest('.sw-corner-hide')) {
                    stop(); swToggleHidden(id);
                    const o = swFindItem(id); if (o) swApplyCornerToggle(card, o, 'hide');
                    return;
                }
                if (t.closest('.sw-btn-edit')) { stop(); swEdit(id); return; }
                if (t.closest('.sw-btn-regen')) { stop(); swRegenDescription(id); return; }
                if (t.closest('.sw-btn-delete')) {
                    stop();
                    if (confirm('Удалить?')) { swRemoveItem(id); swRender(); toastr.info('Удалён', 'Гардероб'); }
                    return;
                }
                // Picture, missing-picture placeholder and the toggle button all
                // mean the same thing: put this on, or take it off.
                if (t.closest('.sw-outfit-img') || t.closest('.sw-img-missing') || t.closest('.sw-btn-activate')) {
                    stop(); swToggle(id);
                }
            });
        }

        // Lost-image fallback: if the file 404s (deleted from disk), swap the broken
        // <img> for a placeholder so the card isn't just a dark void. This one stays
        // per-image because error events do not bubble — but it is one listener per
        // card now instead of ten, and the placeholder's own click is delegated.
        for (const cardImg of content.querySelectorAll('.sw-outfit-card[data-id] .sw-outfit-img')) {
            cardImg.addEventListener('error', () => {
                const wrap = cardImg.closest('.sw-outfit-img-wrap');
                if (!wrap || wrap.querySelector('.sw-img-missing')) return;
                cardImg.remove();
                const ph = document.createElement('div');
                ph.className = 'sw-img-missing';
                ph.innerHTML = '<i class="fa-solid fa-image-slash"></i><span>картинка пропала</span><span class="sw-img-missing-hint">✏️ заменить</span>';
                wrap.insertBefore(ph, wrap.firstChild);
            }, { once: true });
        }

        // ── Current outfit preview ──
        swRenderCurrentOutfit(currentWrap, co, cn);
    }

    function swRenderCurrentOutfit(wrap, co, cn) {
        if (!wrap) return;
        const mode = swGetMode();
        const slots = mode === 'full' ? ['full', 'accessories', 'hair'] : ['top', 'bottom', 'shoes', 'accessories', 'hair'];
        const type = swTab;

        let slotsHtml = '';
        for (const cat of slots) {
            const itemId = co[type]?.[cat] || null;
            const item = itemId ? swFindItem(itemId) : null;
            if (item) {
                const src = swGetOutfitSrc(item);
                slotsHtml += `<div class="sw-current-slot">
                    <img src="${src}" class="sw-current-slot-img" alt="${esc(item.name)}" title="${esc(item.name)}">
                    <span class="sw-current-slot-label">${esc(CATEGORIES[cat])}</span>
                </div>`;
            } else {
                slotsHtml += `<div class="sw-current-slot">
                    <div class="sw-current-slot-empty">${esc(CATEGORIES[cat]?.[0] || '?')}</div>
                    <span class="sw-current-slot-label">${esc(CATEGORIES[cat])}</span>
                </div>`;
            }
        }

        const descText = swBuildDescription(type, cn);
        wrap.innerHTML = `
            <div class="sw-current-title">Сейчас надето (${type === 'bot' ? esc(cn) : '{{user}}'})</div>
            <div class="sw-current-slots">${slotsHtml}</div>
            ${descText ? `<div class="sw-current-desc">${esc(descText)}</div>` : ''}`;
    }

    // ── Build combined description from all active slots ──
    function swBuildDescription(type, cn) {
        const co = swGetCharOutfit();
        if (!co) return '';
        const mode = swGetModeFor(type);
        const slots = mode === 'full' ? ['full', 'accessories', 'hair'] : ['top', 'bottom', 'shoes', 'accessories', 'hair'];
        const SLOT_LABELS = { full: 'FULL', top: 'TOP', bottom: 'BOTTOM', shoes: 'SHOES', accessories: 'ACCESSORIES', hair: 'HAIR' };
        const parts = [];
        for (const cat of slots) {
            const itemId = co[type]?.[cat] || null;
            const item = itemId ? swFindItem(itemId) : null;
            if (item?.description) {
                if (item.description.trim()) parts.push(`${SLOT_LABELS[cat]}: ${item.description.trim()}`);
            }
        }
        return parts.join(' ');
    }

    // Description choice — inline in #sw-tab-content
    function swShowDescriptionModal(outfitName) {
        return new Promise((resolve) => {
            const el = swShowInline(`
                <div style="padding:10px;">
                    <div style="font-size:14px;font-weight:600;color:#f472b6;margin-bottom:6px;">💅 Описание отсутствует</div>
                    <div style="font-size:12px;color:#999;margin-bottom:14px;">«${esc(outfitName)}» — для наилучшего результата добавьте описание</div>
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        <button class="sw-inline-btn" data-choice="skip" style="padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);color:#ddd;cursor:pointer;text-align:left;font-size:13px;"><b>Без описания</b><br><span style="font-size:11px;opacity:0.6;">Надеть как есть</span></button>
                        <button class="sw-inline-btn" data-choice="manual" style="padding:12px;border-radius:8px;border:1px solid rgba(244,114,182,0.25);background:rgba(244,114,182,0.08);color:#ddd;cursor:pointer;text-align:left;font-size:13px;"><b style="color:#f472b6;">✏️ Ввести вручную</b><br><span style="font-size:11px;opacity:0.6;">Описать аутфит своими словами</span></button>
                        <button class="sw-inline-btn" data-choice="ai" style="padding:12px;border-radius:8px;border:1px solid rgba(244,114,182,0.25);background:rgba(244,114,182,0.08);color:#ddd;cursor:pointer;text-align:left;font-size:13px;"><b style="color:#f472b6;">🤖 Сгенерировать ИИ</b><br><span style="font-size:11px;opacity:0.6;">Отправить картинку на анализ</span></button>
                    </div>
                </div>`, () => resolve(null), 'Выбор описания отменён');
            if (!el) { resolve(null); return; }
            for (const btn of el.querySelectorAll('.sw-inline-btn')) {
                btn.addEventListener('click', () => { swRestoreInline(); resolve(btn.dataset.choice); });
            }
        });
    }

    // ── Upload modal (custom, replaces browser prompts) ──
    // Render sub-forms inside #sw-tab-content, replacing the grid temporarily
    let _savedContent = null;
    // Chrome that is meaningless while a sub-form is open. On a phone these four
    // rows plus the worn-outfit strip ate well over 300px, which is why editing an
    // outfit showed a three-line description box under a screenful of filters.
    const SW_CHROME_IDS = ['sw-current-outfit', 'sw-mode-switch', 'sw-cat-tabs', 'sw-tag-filter', 'sw-forwho-filter',
        // The header row belongs here too. Both of these call swRender(), they sit
        // ABOVE #sw-tab-content rather than inside it, and they stayed lit while a
        // form was open — one tap repainted the grid over the form and stranded it.
        'sw-type-tabs', 'sw-show-hidden-toggle'];
    let _savedScroll = 0;
    // How to settle the open form's promise, and what to say if it is torn down
    // from outside. A form resolves ONLY from its own Save/Cancel buttons, which
    // live inside #sw-tab-content — so anything that wipes that subtree without
    // answering leaves its caller awaiting forever AND leaves _savedContent set,
    // which makes swShowInline refuse every later form until the page reloads.
    let _inlineCancel = null;
    let _inlineCancelMsg = '';

    function swShowInline(html, onCancel = null, cancelMsg = '') {
        const el = document.getElementById('sw-tab-content');
        if (!el) return null;
        // One slot holds the grid markup, so a second form opening over the first
        // would overwrite it with the first FORM's markup and the grid would be
        // gone for good. Reachable in practice: the AI-describe call blocks for up
        // to a minute, and nothing stopped the user opening something else meanwhile.
        if (_savedContent !== null) { swLog('WARN', 'inline form already open — not stacking another over it'); return null; }
        _savedContent = el.innerHTML;
        _savedScroll = el.scrollTop;   // put the grid back where the user left it
        _inlineCancel = onCancel;
        _inlineCancelMsg = cancelMsg;
        el.innerHTML = html;
        el.scrollTop = 0;
        for (const id of SW_CHROME_IDS) { const n = document.getElementById(id); if (n) n.style.display = 'none'; }
        return el;
    }
    function swRestoreInline() {
        const el = document.getElementById('sw-tab-content');
        // Release the slot even when the panel has already gone. The old `el &&`
        // guard meant a restore arriving after the wardrobe closed left the slot
        // occupied for the rest of the page's life — that is what turned a stray
        // tap into "nothing in the wardrobe works until I reload".
        if (_savedContent !== null) {
            if (el) el.innerHTML = _savedContent;
            _savedContent = null;
        }
        _inlineCancel = null;
        _inlineCancelMsg = '';
        for (const id of SW_CHROME_IDS) { const n = document.getElementById(id); if (n) n.style.display = ''; }
        if (!el) { _savedScroll = 0; return; }
        swRender(); // re-render to rebind events
        const el2 = document.getElementById('sw-tab-content');
        if (el2 && _savedScroll) { el2.scrollTop = _savedScroll; _savedScroll = 0; }
    }

    // Tear an open form down from outside and ANSWER it, so whoever is awaiting it
    // stops waiting. Returns true if there was a form to close. Everything that
    // can destroy #sw-tab-content goes through here: Escape, the ✕, the backdrop,
    // and swRender itself.
    function swAbortInline({ notify = false } = {}) {
        if (_savedContent === null) return false;
        const fn = _inlineCancel;
        const msg = _inlineCancelMsg;
        swRestoreInline();                       // puts the grid back, clears the slot
        if (fn) { try { fn(); } catch (e) { swLog('WARN', 'inline cancel failed:', e?.message); } }
        if (notify && msg) toastr.info(msg, '\u{1F45A} Гардероб', { timeOut: 2500 });
        return true;
    }

    // ── Outfit card export/import (SillyTavern-card style: PNG + tEXt chunk) ──
    // A shared outfit is a regular PNG of the clothing image with a tEXt chunk
    // keyed SW_PNG_CHUNK_KEY holding base64(UTF-8 JSON):
    //   { spec:'slay_wardrobe_item', spec_version:'1.0',
    //     item:{ name, description, category, forWho, gender, tags } }
    // Local-only fields (id, addedAt, favourite, lastWorn*, hidden) are NOT
    // exported; import mints a fresh id. The file opens as a normal image
    // anywhere — the metadata rides along invisibly, like ST character cards.
    const SW_PNG_CHUNK_KEY = 'slaywardrobe';
    const SW_CARD_SPEC = 'slay_wardrobe_item';
    const SW_PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];

    const swCrcTable = (() => {
        const t = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            t[n] = c >>> 0;
        }
        return t;
    })();
    function swCrc32(bytes, start = 0, end = bytes.length) {
        let c = 0xFFFFFFFF;
        for (let i = start; i < end; i++) c = swCrcTable[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
        return (c ^ 0xFFFFFFFF) >>> 0;
    }
    function swB64EncodeUnicode(str) {
        const bytes = new TextEncoder().encode(str);
        let bin = '';
        const CHUNK = 0x8000; // avoid call-stack overflow on large arrays
        for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
        return btoa(bin);
    }
    function swB64DecodeUnicode(b64) {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    }
    function swIsPng(bytes) {
        if (!bytes || bytes.length < 8) return false;
        for (let i = 0; i < 8; i++) if (bytes[i] !== SW_PNG_SIG[i]) return false;
        return true;
    }
    // Walk PNG chunks; cb(type, dataStart, dataLen, chunkStart, chunkEnd) — return true to stop.
    function swPngWalkChunks(bytes, cb) {
        const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        let off = 8;
        while (off + 8 <= bytes.length) {
            const len = dv.getUint32(off);
            const type = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7]);
            const chunkEnd = off + 12 + len;
            if (chunkEnd > bytes.length) break; // malformed
            if (cb(type, off + 8, len, off, chunkEnd)) return;
            off = chunkEnd;
        }
    }
    // Read tEXt chunk value for our keyword; null if absent or not a PNG.
    function swPngReadText(bytes, keyword) {
        if (!swIsPng(bytes)) return null;
        let found = null;
        swPngWalkChunks(bytes, (type, dStart, dLen) => {
            if (type !== 'tEXt') return false;
            let kEnd = dStart;
            const dEnd = dStart + dLen;
            while (kEnd < dEnd && bytes[kEnd] !== 0) kEnd++;
            const kw = String.fromCharCode(...bytes.subarray(dStart, kEnd));
            if (kw !== keyword) return false;
            // The chunk length comes from the file itself, so a crafted PNG can
            // claim hundreds of megabytes and this loop will dutifully build the
            // string one character at a time until the tab dies. Real outfit
            // cards are a couple of KB; 1 MB is already absurdly generous.
            if (dEnd - kEnd > 1048576) { swLog('WARN', `outfit card: tEXt chunk of ${dEnd - kEnd} bytes is not plausible — ignoring`); return true; }
            let text = '';
            for (let i = kEnd + 1; i < dEnd; i++) text += String.fromCharCode(bytes[i]);
            found = text;
            return true;
        });
        return found;
    }
    // Insert a tEXt chunk (keyword + latin1 text) right before IEND; strips any
    // pre-existing chunk with the same keyword first.
    function swPngInsertText(bytes, keyword, text) {
        if (!swIsPng(bytes)) throw new Error('not a PNG');
        // locate & drop existing same-keyword tEXt + find IEND start
        const dropRanges = [];
        let iendStart = -1;
        swPngWalkChunks(bytes, (type, dStart, dLen, cStart, cEnd) => {
            if (type === 'tEXt') {
                let kEnd = dStart;
                const dEnd = dStart + dLen;
                while (kEnd < dEnd && bytes[kEnd] !== 0) kEnd++;
                const kw = String.fromCharCode(...bytes.subarray(dStart, kEnd));
                if (kw === keyword) dropRanges.push([cStart, cEnd]);
            }
            if (type === 'IEND') { iendStart = cStart; return true; }
            return false;
        });
        if (iendStart < 0) throw new Error('PNG has no IEND');
        // build new tEXt chunk bytes
        const kwBytes = new TextEncoder().encode(keyword);
        const txtBytes = new Uint8Array(text.length);
        for (let i = 0; i < text.length; i++) txtBytes[i] = text.charCodeAt(i) & 0xFF;
        const data = new Uint8Array(kwBytes.length + 1 + txtBytes.length);
        data.set(kwBytes, 0); data[kwBytes.length] = 0; data.set(txtBytes, kwBytes.length + 1);
        const chunk = new Uint8Array(12 + data.length);
        const cdv = new DataView(chunk.buffer);
        cdv.setUint32(0, data.length);
        chunk[4] = 0x74; chunk[5] = 0x45; chunk[6] = 0x58; chunk[7] = 0x74; // 'tEXt'
        chunk.set(data, 8);
        cdv.setUint32(8 + data.length, swCrc32(chunk, 4, 8 + data.length));
        // reassemble: original minus dropRanges, with new chunk spliced before IEND
        const parts = [];
        let cursor = 0;
        const boundaries = [...dropRanges, [iendStart, iendStart]].sort((a, b) => a[0] - b[0]);
        for (const [s, e] of boundaries) {
            if (s > cursor) parts.push(bytes.subarray(cursor, s));
            if (s === iendStart && e === iendStart) parts.push(chunk); // splice point
            cursor = Math.max(cursor, e);
        }
        parts.push(bytes.subarray(cursor));
        const total = parts.reduce((n, p) => n + p.length, 0);
        const out = new Uint8Array(total);
        let o = 0;
        for (const p of parts) { out.set(p, o); o += p.length; }
        return out;
    }

    // Export an item as a shareable PNG card (image + embedded metadata).
    async function swExportItem(id) {
        const o = swFindItem(id);
        if (!o) { toastr.error('Предмет не найден', 'Гардероб'); return; }
        try {
            const _tExport = toastr.info('Собираю карточку...', 'Гардероб', { timeOut: 0, extendedTimeOut: 0 });
            // Load the current image (path preferred, inline base64 fallback)
            const src = swGetOutfitSrc(o);
            if (!src) throw new Error('у предмета нет картинки');
            // Re-encode through canvas: unifies jpeg/webp/png sources into PNG
            // (tEXt chunks only exist in PNG). Same-origin, so no canvas taint.
            const img = await new Promise((res, rej) => {
                const im = new Image();
                im.onload = () => res(im);
                im.onerror = () => rej(new Error('картинка не загрузилась (файл удалён?)'));
                im.src = src;
            });
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
            canvas.getContext('2d').drawImage(img, 0, 0);
            const blob = await new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/png'));
            const bytes = new Uint8Array(await blob.arrayBuffer());
            const payload = {
                spec: SW_CARD_SPEC,
                spec_version: '1.0',
                item: {
                    name: o.name || '',
                    description: o.description || '',
                    category: o.category || 'full',
                    forWho: o.forWho || 'all',
                    gender: o.gender || 'unisex',
                    tags: Array.isArray(o.tags) ? o.tags : [],
                },
            };
            const withChunk = swPngInsertText(bytes, SW_PNG_CHUNK_KEY, swB64EncodeUnicode(JSON.stringify(payload)));
            const outBlob = new Blob([withChunk], { type: 'image/png' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(outBlob);
            const safe = String(o.name || 'outfit').replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/\s+/g, '_') || 'outfit';
            a.download = `slay_outfit_${safe}.png`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
            try { toastr.clear(_tExport); } catch (_) {}
            toastr.success(`Карточка «${o.name}» экспортирована`, 'Гардероб', { timeOut: 2500 });
        } catch (e) { try { toastr.clear(_tExport); } catch (_) {} toastr.error('Экспорт не удался: ' + (e?.message || e), 'Гардероб'); }
    }

    // Try to read outfit-card metadata from a picked file. Returns item-shaped
    // object or null (not a PNG / no chunk / wrong spec / parse error).
    function swParseOutfitCard(bytes, fileName = '') {
        try {
            // Distinguish the two "no card" cases in the log: mobile galleries and
            // messengers re-encode images (PNG→JPEG or fresh PNG), stripping tEXt.
            if (!swIsPng(bytes)) { swLog('INFO', `outfit card: "${fileName}" is not a PNG — likely re-encoded by gallery/messenger`); return null; }
            const raw = swPngReadText(bytes, SW_PNG_CHUNK_KEY);
            if (!raw) { swLog('INFO', `outfit card: "${fileName}" is a PNG without embedded outfit data`); return null; }
            const payload = JSON.parse(swB64DecodeUnicode(raw));
            if (payload?.spec !== SW_CARD_SPEC || !payload.item) return null;
            const it = payload.item;
            return {
                name: String(it.name || '').slice(0, 100),
                description: String(it.description || '').slice(0, 2000),
                category: CAT_KEYS.includes(it.category) ? it.category : 'full',
                forWho: ['all', 'bot', 'user'].includes(it.forWho) ? it.forWho : 'all',
                gender: GENDER_KEYS.includes(it.gender) ? it.gender : 'unisex',
                tags: Array.isArray(it.tags) ? it.tags.filter(t => TAG_KEYS.includes(t)) : [],
            };
        } catch (e) { swLog('WARN', 'swParseOutfitCard failed:', e?.message); return null; }
    }

    function swShowUploadModal(defaultName, defaults = null) {
        return new Promise((resolve) => {
            // defaults (from an imported outfit card) win over the generic
            // fallbacks: name, category, forWho, gender, tags come pre-filled.
            const selCat = defaults?.category || swCatTab;
            const selForWho = defaults?.forWho || (swTab === 'bot' ? 'bot' : (swTab === 'user' ? 'user' : 'all'));
            const selGender = defaults?.gender || 'unisex';
            const selTags = new Set(defaults?.tags || []);
            const nameVal = defaults?.name || defaultName;
            let tagsHtml = '';
            for (const tag of TAG_KEYS) { tagsHtml += `<label style="display:inline-flex;align-items:center;gap:3px;font-size:12px;color:#bbb;cursor:pointer;"><input type="checkbox" value="${tag}" ${selTags.has(tag) ? 'checked' : ''} style="accent-color:#db7093;"> ${esc(TAGS[tag])}</label> `; }
            let catOptions = '';
            for (const cat of CAT_KEYS) { catOptions += `<option value="${cat}" ${cat === selCat ? 'selected' : ''}>${esc(CATEGORIES[cat])}</option>`; }

            const el = swShowInline(`
                <div style="padding:10px;">
                    <h3 style="margin:0 0 12px;font-size:15px;color:#f472b6;">${defaults ? '🧥 Импорт костюма' : '👗 Новый предмет'}</h3>
                    ${defaults ? '<div style="font-size:11px;color:#9c8;margin:0 0 8px;">В картинке найдены данные костюма — поля заполнены автоматически.</div>' : ''}
                    <label style="display:block;font-size:12px;color:#aaa;margin:8px 0 4px;">Название</label>
                    <input type="text" id="sw-upl-name" value="${esc(nameVal)}" placeholder="Название" style="width:100%;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.2);color:#eee;font-size:13px;box-sizing:border-box;">
                    <label style="display:block;font-size:12px;color:#aaa;margin:8px 0 4px;">Категория</label>
                    <select id="sw-upl-cat" style="width:100%;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.2);color:#eee;font-size:13px;box-sizing:border-box;">${catOptions}</select>
                    <label style="display:block;font-size:12px;color:#aaa;margin:8px 0 4px;">Для кого</label>
                    <select id="sw-upl-forwho" style="width:100%;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.2);color:#eee;font-size:13px;box-sizing:border-box;"><option value="all" ${selForWho === 'all' ? 'selected' : ''}>Все</option><option value="bot" ${selForWho === 'bot' ? 'selected' : ''}>Бот</option><option value="user" ${selForWho === 'user' ? 'selected' : ''}>Юзер</option></select>
                    <label style="display:block;font-size:12px;color:#aaa;margin:8px 0 4px;">Пол</label>
                    <select id="sw-upl-gender" style="width:100%;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.2);color:#eee;font-size:13px;box-sizing:border-box;"><option value="unisex" ${selGender === 'unisex' ? 'selected' : ''}>⚥ Унисекс</option><option value="female" ${selGender === 'female' ? 'selected' : ''}>♀️ Женское</option><option value="male" ${selGender === 'male' ? 'selected' : ''}>♂️ Мужское</option></select>
                    <label style="display:block;font-size:12px;color:#aaa;margin:8px 0 4px;">Теги</label>
                    <div id="sw-upl-tags" style="display:flex;flex-wrap:wrap;gap:6px;">${tagsHtml}</div>
                    <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end;">
                        <button id="sw-upl-cancel" style="padding:8px 18px;border-radius:10px;border:none;cursor:pointer;font-size:13px;background:rgba(255,255,255,0.08);color:#aaa;">Отмена</button>
                        <button id="sw-upl-save" style="padding:8px 18px;border-radius:10px;border:none;cursor:pointer;font-size:13px;background:rgba(219,112,147,0.3);color:#f0a0c0;">Сохранить</button>
                    </div>
                </div>`, () => resolve(null), defaults ? 'Импорт отменён' : 'Загрузка отменена');
            if (!el) { resolve(null); return; }

            const close = (val) => { swRestoreInline(); resolve(val); };
            el.querySelector('#sw-upl-cancel').addEventListener('click', () => close(null));
            el.querySelector('#sw-upl-save').addEventListener('click', () => {
                const name = el.querySelector('#sw-upl-name').value.trim();
                if (!name) { toastr.warning('Введите название', 'Гардероб'); return; }
                const category = el.querySelector('#sw-upl-cat').value;
                const forWho = el.querySelector('#sw-upl-forwho').value;
                const gender = el.querySelector('#sw-upl-gender').value;
                const tags = [...el.querySelectorAll('#sw-upl-tags input:checked')].map(c => c.value);
                close({ name, category, forWho, gender, tags });
            });
            setTimeout(() => el.querySelector('#sw-upl-name')?.focus(), 50);
        });
    }

    // ── Description input modal (replaces browser prompt()) ──
    function swShowDescInput(title, value) {
        return new Promise((resolve) => {
            const el = swShowInline(`
                <div style="padding:10px;">
                    <div style="font-size:14px;font-weight:600;color:#f472b6;margin-bottom:12px;">${esc(title)}</div>
                    <textarea id="sw-descinput-text" style="width:100%;min-height:100px;max-height:200px;padding:10px;border-radius:8px;border:1px solid rgba(244,114,182,0.2);background:rgba(0,0,0,0.3);color:#eee;font-size:13px;line-height:1.5;resize:vertical;box-sizing:border-box;font-family:inherit;">${esc(value || '')}</textarea>
                    <div style="font-size:11px;color:#888;margin-top:4px;" id="sw-descinput-count">${(value || '').length} символов</div>
                    <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end;">
                        <button id="sw-descinput-cancel" style="padding:8px 18px;border-radius:10px;border:none;cursor:pointer;font-size:13px;background:rgba(255,255,255,0.08);color:#aaa;">Отмена</button>
                        <button id="sw-descinput-save" style="padding:8px 18px;border-radius:10px;border:none;cursor:pointer;font-size:13px;background:rgba(244,114,182,0.25);color:#f472b6;font-weight:500;">Сохранить</button>
                    </div>
                </div>`, () => resolve(null), 'Ввод описания отменён');
            if (!el) { resolve(null); return; }
            const textarea = el.querySelector('#sw-descinput-text');
            const counter = el.querySelector('#sw-descinput-count');
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
            textarea.addEventListener('input', () => { counter.textContent = `${textarea.value.length} символов`; });
            const close = (val) => { swRestoreInline(); resolve(val); };
            el.querySelector('#sw-descinput-cancel').addEventListener('click', () => close(null));
            el.querySelector('#sw-descinput-save').addEventListener('click', () => close(textarea.value.trim()));
        });
    }

    // ── Edit modal (custom, replaces browser prompts) ──
    function swShowEditModal(item) {
        return new Promise((resolve) => {
            let tagsHtml = '';
            for (const tag of TAG_KEYS) {
                const checked = Array.isArray(item.tags) && item.tags.includes(tag) ? 'checked' : '';
                tagsHtml += `<label style="display:inline-flex;align-items:center;gap:3px;font-size:12px;color:#bbb;cursor:pointer;"><input type="checkbox" value="${tag}" ${checked} style="accent-color:#db7093;"> ${esc(TAGS[tag])}</label> `;
            }
            let catOptions = '';
            for (const cat of CAT_KEYS) { catOptions += `<option value="${cat}" ${item.category === cat ? 'selected' : ''}>${esc(CATEGORIES[cat])}</option>`; }

            const el = swShowInline(`
                <div style="padding:10px;">
                    <h3 style="margin:0 0 12px;font-size:15px;color:#f472b6;">✏️ Редактировать</h3>
                    <div style="display:flex;gap:12px;margin:0 0 6px;align-items:center;">
                        <img id="sw-edit-thumb" src="${esc(swGetOutfitSrc(item) || '')}" alt="" style="width:64px;height:84px;object-fit:cover;object-position:center top;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.2);flex-shrink:0;">
                        <div style="display:flex;flex-direction:column;gap:6px;min-width:0;">
                            <button id="sw-edit-replace" type="button" style="padding:7px 12px;border-radius:8px;border:1px solid rgba(244,114,182,0.3);cursor:pointer;font-size:12px;background:rgba(244,114,182,0.12);color:#f0a0c0;display:inline-flex;align-items:center;gap:6px;"><i class="fa-solid fa-image"></i> Заменить картинку</button>
                            <span style="font-size:11px;color:#888;">описание и данные останутся</span>
                            <button id="sw-edit-export" type="button" style="padding:7px 12px;border-radius:8px;border:1px solid rgba(147,197,219,0.3);cursor:pointer;font-size:12px;background:rgba(147,197,219,0.1);color:#a0d0f0;display:inline-flex;align-items:center;gap:6px;"><i class="fa-solid fa-file-export"></i> Экспорт PNG</button>
                            <span style="font-size:11px;color:#888;">картинка + данные в одном файле — можно делиться</span>
                        </div>
                    </div>
                    <input type="file" id="sw-edit-file" accept="image/*" style="display:none;">
                    <label style="display:block;font-size:12px;color:#aaa;margin:8px 0 4px;">Название</label>
                    <input type="text" id="sw-edit-name" value="${esc(item.name)}" style="width:100%;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.2);color:#eee;font-size:13px;box-sizing:border-box;">
                    <label style="display:block;font-size:12px;color:#aaa;margin:8px 0 4px;">Описание</label>
                    <textarea id="sw-edit-desc" style="width:100%;min-height:60px;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.2);color:#eee;font-size:13px;box-sizing:border-box;resize:vertical;">${esc(item.description || '')}</textarea>
                    <label style="display:block;font-size:12px;color:#aaa;margin:8px 0 4px;">Категория</label>
                    <select id="sw-edit-cat" style="width:100%;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.2);color:#eee;font-size:13px;box-sizing:border-box;">${catOptions}</select>
                    <label style="display:block;font-size:12px;color:#aaa;margin:8px 0 4px;">Для кого</label>
                    <select id="sw-edit-forwho" style="width:100%;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.2);color:#eee;font-size:13px;box-sizing:border-box;"><option value="all" ${(item.forWho || 'all') === 'all' ? 'selected' : ''}>Все</option><option value="bot" ${item.forWho === 'bot' ? 'selected' : ''}>Бот</option><option value="user" ${item.forWho === 'user' ? 'selected' : ''}>Юзер</option></select>
                    <label style="display:block;font-size:12px;color:#aaa;margin:8px 0 4px;">Пол</label>
                    <select id="sw-edit-gender" style="width:100%;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.2);color:#eee;font-size:13px;box-sizing:border-box;"><option value="unisex" ${(item.gender || 'unisex') === 'unisex' ? 'selected' : ''}>⚥ Унисекс</option><option value="female" ${item.gender === 'female' ? 'selected' : ''}>♀️ Женское</option><option value="male" ${item.gender === 'male' ? 'selected' : ''}>♂️ Мужское</option></select>
                    <label style="display:block;font-size:12px;color:#aaa;margin:8px 0 4px;">Теги</label>
                    <div id="sw-edit-tags" style="display:flex;flex-wrap:wrap;gap:6px;">${tagsHtml}</div>
                    <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end;">
                        <button id="sw-edit-cancel" style="padding:8px 18px;border-radius:10px;border:none;cursor:pointer;font-size:13px;background:rgba(255,255,255,0.08);color:#aaa;">Отмена</button>
                        <button id="sw-edit-save" style="padding:8px 18px;border-radius:10px;border:none;cursor:pointer;font-size:13px;background:rgba(219,112,147,0.3);color:#f0a0c0;">Сохранить</button>
                    </div>
                </div>`, () => resolve(null), 'Редактирование отменено');
            if (!el) { resolve(null); return; }
            const close = (val) => { swRestoreInline(); resolve(val); };
            el.querySelector('#sw-edit-cancel').addEventListener('click', () => close(null));
            // ── Replace image: keep ALL metadata (name/desc/category/forWho/gender/tags),
            // swap only the picture. Mutates the live item + saves immediately (independent
            // of Save/Cancel of the text fields). Don't call swRender here — it would rebuild
            // #sw-tab-content and destroy this inline panel; the grid refreshes on close via
            // swRestoreInline→swRender.
            const replaceFile = el.querySelector('#sw-edit-file');
            el.querySelector('#sw-edit-replace')?.addEventListener('click', () => replaceFile?.click());
            el.querySelector('#sw-edit-export')?.addEventListener('click', () => swExportItem(item.id));
            replaceFile?.addEventListener('change', async () => {
                const f = replaceFile.files?.[0];
                if (!f) return;
                let _tReplace = null;
                try {
                    _tReplace = toastr.info('Загрузка картинки...', 'Гардероб', { timeOut: 0, extendedTimeOut: 0 });
                    const { base64, format } = await swResize(f, swGetSettings().maxDimension);
                    const path = await swSaveImageToFile(base64, `wardrobe_${item.name}`, format);
                    const oldPath = item.imagePath;
                    item.imagePath = path;
                    item.base64 = '';
                    swSave();
                    // Old picture is unreferenced now — don't leave it on disk.
                    if (oldPath && oldPath !== path) swDeleteImageFile(oldPath, { ignoreItemId: item.id });
                    swUpdatePromptInjection();
                    const thumb = el.querySelector('#sw-edit-thumb');
                    if (thumb) thumb.src = path + '?t=' + Date.now();
                    try { toastr.clear(_tReplace); } catch (_) {}
                    toastr.success('Картинка заменена', 'Гардероб', { timeOut: 2000 });
                } catch (e) { toastr.error('Ошибка: ' + (e?.message || e), 'Гардероб'); }
                finally { replaceFile.value = ''; try { toastr.clear(_tReplace); } catch (_) {} }
            });
            el.querySelector('#sw-edit-save').addEventListener('click', () => {
                const name = el.querySelector('#sw-edit-name').value.trim();
                if (!name) { toastr.warning('Введите название', 'Гардероб'); return; }
                const description = el.querySelector('#sw-edit-desc').value.trim();
                const category = el.querySelector('#sw-edit-cat').value;
                const forWho = el.querySelector('#sw-edit-forwho').value;
                const gender = el.querySelector('#sw-edit-gender').value;
                const tags = [...el.querySelectorAll('#sw-edit-tags input:checked')].map(c => c.value);
                close({ name, description, category, forWho, gender, tags });
            });
            // was m.querySelector — `m` doesn't exist in this scope (it lives in
            // swOpenModal). This was THE long-standing "Uncaught ReferenceError:
            // m is not defined" console error fired 50ms after opening item edit.
            setTimeout(() => el.querySelector('#sw-edit-name')?.focus(), 50);
        });
    }

    async function swToggle(id) {
        const co = swGetCharOutfit();
        if (!co) return;
        const cn = swCharName();
        const o = swFindItem(id);
        if (!o) return;
        const nm = o.name || id;
        const cat = o.category || 'full';
        const mode = swGetMode();

        // Check category+mode compatibility
        if (swIsCatBlocked(mode, cat)) {
            toastr.warning(`Категория "${CATEGORIES[cat]}" недоступна в режиме "${mode === 'full' ? 'Полный комплект' : 'По частям'}"`, 'Гардероб');
            return;
        }

        const currentId = co[swTab]?.[cat] || null;
        const off = currentId === id;

        // If putting ON and no description — show custom modal (unless user opted out)
        if (!off && o && !o.description?.trim() && !swGetSettings().skipDescriptionWarning) {
            const choice = await swShowDescriptionModal(nm);

            if (choice === null) return;

            if (choice === 'manual') {
                const desc = await swShowDescInput('✏️ Описание аутфита', '');
                if (desc) { o.description = desc; swSave(); swRender(); }
                if (!o.description?.trim()) return;
            } else if (choice === 'ai') {
                const imgBase64 = o.imagePath ? await swLoadImageAsBase64(o.imagePath) : o.base64;
                if (imgBase64) {
                    const autoDesc = await swAnalyzeOutfit(imgBase64, cat);
                    if (autoDesc) {
                        const edited = await swShowDescInput('🤖 Описание (можете отредактировать)', autoDesc);
                        if (edited) { o.description = edited; swSave(); swRender(); }
                    } else {
                        toastr.warning('Не удалось сгенерировать. Попробуйте вручную.', 'Гардероб');
                        return;
                    }
                }
                if (!o.description?.trim()) return;
            }
            // 'skip' — proceed without description
        }

        if (off) {
            // Un-equip
            swSetSlot(swTab, cat, null);
        } else {
            // Equip — handle mode rules
            if (mode === 'full' && cat === 'full') {
                // Clear top/bottom/shoes (shouldn't have them, but just in case)
                co[swTab].top = null;
                co[swTab].bottom = null;
                co[swTab].shoes = null;
            }
            swSetSlot(swTab, cat, id);
        }

        swRender();
        swUpdatePromptInjection();
        swInjectFloatingBtn();
        off ? toastr.info(`\u00AB${nm}\u00BB снят`, 'Гардероб', { timeOut: 2000 }) : toastr.success(`\u00AB${nm}\u00BB надет`, 'Гардероб', { timeOut: 2000 });
    }

    const DESCRIBE_PROMPTS = {
        detailed: 'Reply IMMEDIATELY with a clothing description. Skip any thinking, reasoning, or preamble. Start directly with the garment name. Max 3 sentences, max 500 characters. Include: garment names, fabric, texture, fit, colors. Avoid mentioning what is absent or missing. English only.',
        simple: 'Reply IMMEDIATELY with a brief clothing description. Skip any thinking or preamble. Max 2 sentences, max 300 characters. List garments, colors. Avoid mentioning what is absent or missing. English only.',
        hair: 'Reply IMMEDIATELY with a short hairstyle description. Skip any thinking or preamble. Max 15 words. Format: "[style], [length], [texture]". Avoid mentioning hair color. Avoid mentioning what is absent or missing. Keep to one sentence only.',
    };

    async function swAnalyzeOutfit(base64, category) {
        const swS = swGetSettings();
        const mode = swS.describeMode || 'direct';
        const promptStyle = (category === 'hair') ? 'hair' : (swS.describePromptStyle || 'detailed');
        const describePrompt = DESCRIBE_PROMPTS[promptStyle] || DESCRIBE_PROMPTS.detailed;
        const maxDescLen = (category === 'hair') ? 250 : (promptStyle === 'simple' ? 400 : 600);
        const maxTokens = (category === 'hair') ? 80 : 300;
        swLog('INFO', `swAnalyzeOutfit: mode=${mode}, promptStyle=${promptStyle}, maxLen=${maxDescLen}`);
        const _tDescribe = toastr.info('Анализ образа...', 'Гардероб', { timeOut: 0, extendedTimeOut: 0 });

        // ── Direct API mode (recommended) ──
        if (mode === 'direct') {
            const iigSettings = SillyTavern.getContext().extensionSettings[MODULE_NAME] || {};
            // Resolve host and credential as a PAIR. Falling back independently
            // meant that typing a custom describe endpoint while leaving its key
            // blank (the field's placeholder invites exactly that) sent the main
            // image-generation key to that other host — on the very first "Тест".
            const useOwnEndpoint = !!swS.describeEndpoint;
            const endpoint = normalizeApiEndpoint(swS.describeEndpoint || iigSettings.endpoint || '');
            const apiKey = useOwnEndpoint ? (swS.describeKey || '') : (iigSettings.apiKey || '');
            if (useOwnEndpoint && !apiKey) {
                toastr.error('Вы указали свой Endpoint для описаний, но не указали к нему ключ. Основной ключ туда не отправляется — впишите ключ или очистите Endpoint.', 'Гардероб', { timeOut: 10000 });
                try { toastr.clear(_tDescribe); } catch (_) {}
                return null;
            }
            const modelSelect = document.getElementById('slay_sw_describe_model');
            const model = modelSelect?.value || swS.describeModel || iigSettings.model || 'gemini-2.5-flash';
            if (!endpoint || !apiKey) {
                toastr.warning('Настройте API для описания в секции Гардероб', 'Гардероб', { timeOut: 5000 });
                try { toastr.clear(_tDescribe); } catch (_) {}
                return null;
            }
            // Determine API format: user choice > auto-detect by model name
            const apiFormat = swS.describeApiFormat || 'auto';
            let useGeminiFormat;
            if (apiFormat === 'gemini') useGeminiFormat = true;
            else if (apiFormat === 'openai') useGeminiFormat = false;
            else useGeminiFormat = model.toLowerCase().includes('gemini') || model.toLowerCase().includes('nano-banana');
            swLog('INFO', `Describe API format: ${apiFormat} -> ${useGeminiFormat ? 'gemini' : 'openai'}, model=${model}`);

            try {
                let desc = null;

                // Retry on transient failures (429 rate-limit, 5xx) up to 2 times
                // with short backoff. First upload of the session often hits 429
                // on a "warm" Gemini key because previous chat completions bumped
                // the shared per-minute quota.
                const callApi = async () => {
                    if (useGeminiFormat) {
                        const url = `${endpoint}/v1beta/models/${model}:generateContent`;
                        const body = {
                            contents: [{
                                role: 'user', parts: [
                                    { inlineData: { mimeType: 'image/png', data: base64 } },
                                    { text: describePrompt }
                                ]
                            }],
                            generationConfig: { responseModalities: ['TEXT'], maxOutputTokens: maxTokens }
                        };
                        // robustFetch, not bare fetch: this was the only request in the file with
                        // no timeout at all, so a stalled describe hung the upload with no way out.
                        const response = await robustFetch(url, { method: 'POST', headers: buildAuthHeaders(apiKey, { 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
                        if (!response.ok) { const err = new Error(`API ${response.status}`); err.status = response.status; throw err; }
                        const result = await response.json();
                        try { toastr.clear(_tDescribe); } catch (_) {}
                        return result.candidates?.[0]?.content?.parts?.find(p => p.text)?.text?.trim() || '';
                    } else {
                        const url = `${endpoint}/v1/chat/completions`;
                        const body = {
                            model, max_tokens: maxTokens,
                            messages: [
                                { role: 'system', content: describePrompt },
                                {
                                    role: 'user', content: [
                                        { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } },
                                        { type: 'text', text: 'Describe the clothing in this image.' }
                                    ]
                                }
                            ]
                        };
                        // robustFetch, not bare fetch: this was the only request in the file with
                        // no timeout at all, so a stalled describe hung the upload with no way out.
                        const response = await robustFetch(url, { method: 'POST', headers: buildAuthHeaders(apiKey, { 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
                        if (!response.ok) { const err = new Error(`API ${response.status}`); err.status = response.status; throw err; }
                        const result = await response.json();
                        try { toastr.clear(_tDescribe); } catch (_) {}
                        return result.choices?.[0]?.message?.content?.trim() || '';
                    }
                };

                const MAX_RETRIES = 2;
                for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                    try { desc = await callApi(); break; }
                    catch (err) {
                        const status = err.status || 0;
                        const retryable = status === 429 || (status >= 500 && status < 600);
                        if (!retryable || attempt === MAX_RETRIES) throw err;
                        const delay = 800 * Math.pow(2, attempt); // 800ms, 1600ms
                        swLog('WARN', `Describe API ${status}, retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`);
                        await new Promise(r => setTimeout(r, delay));
                    }
                }

                if (desc) {
                    // Strip thinking/reasoning preamble if model outputs it
                    // Strip thinking/reasoning: find where actual description starts
                    desc = desc.replace(/^\*\*.*?\*\*\s*/s, '');
                    if (/^(My Thought|Okay|Let me|I need to|First|Here's|Here is|Alright|So,|Right|Looking|I'm seeing|The prompt|Let's|I see)/i.test(desc)) {
                        const parts = desc.split(/\n\n/);
                        if (parts.length > 1) { desc = parts[parts.length - 1]; }
                        else {
                            const clothingMatch = desc.match(/(?:^|[.!]\s+)((?:A |An |The |Fitted |Loose |Soft |Thick |Thin |Dark |Light |Black |White |Red |Blue |Pink |Green |Long |Short |High |Low |Cropped |Oversized |Slim |Wide |Strapless |Off-shoulder |V-neck )[A-Z]?[a-z].*)/i);
                            if (clothingMatch) desc = clothingMatch[1];
                        }
                    }
                    desc = desc.replace(/^["'`]+|["'`]+$/g, '').replace(/^(Here|This|The image|I see|In this).{0,20}(shows?|features?|depicts?|displays?)\s*/i, '');
                }
                // Truncate to maxDescLen if model ignores token limits
                if (desc && desc.length > maxDescLen) {
                    const lastDot = desc.lastIndexOf('.', maxDescLen);
                    desc = lastDot > 50 ? desc.substring(0, lastDot + 1) : desc.substring(0, maxDescLen);
                    swLog('INFO', `Description truncated to ${desc.length} chars`);
                }
                if (desc && desc.length > 10) {
                    swLog('INFO', `Direct API described (${model}):`, desc.substring(0, 100)); return desc;
                }
                swLog('WARN', `Direct API: unusable result (len=${desc?.length || 0})`);
            } catch (e) { swLog('WARN', `Direct API failed (${model}):`, e.message); toastr.warning(`Ошибка: ${e.message}`, 'Гардероб', { timeOut: 5000 }); }
            try { toastr.clear(_tDescribe); } catch (_) {}
            return null;
        }

        // ── Chat API mode ──
        const ctx = SillyTavern.getContext();

        if (typeof ctx.generateRaw === 'function') {
            try {
                const messages = [
                    { role: 'system', content: describePrompt },
                    {
                        role: 'user', content: [
                            { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } },
                            { type: 'text', text: 'Describe the clothing in this image.' },
                        ]
                    },
                ];
                const rawResult = await ctx.generateRaw({ prompt: messages, maxTokens: maxTokens });
                const result = typeof rawResult === 'string' ? rawResult : (rawResult?.text || rawResult?.message || String(rawResult || ''));
                let desc = (result || '').trim().replace(/^["'`]+|["'`]+$/g, '');
                if (desc && desc.length > maxDescLen) { const ld = desc.lastIndexOf('.', maxDescLen); desc = ld > 50 ? desc.substring(0, ld + 1) : desc.substring(0, maxDescLen); }
                if (desc && desc.length > 10) { return desc; }
            } catch (e) { swLog('WARN', 'generateRaw failed:', e.message); }
        }

        if (typeof ctx.generateQuietPrompt === 'function') {
            try {
                const rawResult = await ctx.generateQuietPrompt({ quietPrompt: '[OOC: Describe ONLY the clothing in the attached image. 1-2 sentences, English, no RP.]', quietImage: `data:image/png;base64,${base64}`, maxTokens: maxTokens });
                const result = typeof rawResult === 'string' ? rawResult : (rawResult?.text || rawResult?.message || String(rawResult || ''));
                let desc = (result || '').trim().replace(/^["'`]+|["'`]+$/g, '');
                if (desc && desc.length > maxDescLen) { const ld = desc.lastIndexOf('.', maxDescLen); desc = ld > 50 ? desc.substring(0, ld + 1) : desc.substring(0, maxDescLen); }
                if (desc && desc.length > 10) { return desc; }
            } catch (e) { swLog('WARN', 'generateQuietPrompt failed:', e.message); }
        }

        toastr.warning('Не удалось описать. Введите вручную.', 'Гардероб', { timeOut: 5000 });
        try { toastr.clear(_tDescribe); } catch (_) {}
        return null;
    }

    async function swUpload(importMode = false) {
        const inp = document.createElement('input'); inp.type = 'file';
        // Import mode: NO accept filter. With accept="image/*" Android opens the
        // photo picker (gallery), which can hand over a re-encoded copy with the
        // tEXt chunk stripped; the plain document picker returns original bytes.
        if (!importMode) inp.accept = 'image/*';
        inp.addEventListener('change', async () => {
            const f = inp.files?.[0]; if (!f) return;
            const defaultName = f.name.replace(/\.[^.]+$/, '');

            // Read the WHOLE file into memory right now, while the picker handle
            // is fresh. On Android a File is a content:// ticket that routinely
            // expires while the user fills the form modal (browser suspended
            // behind the picker, cloud-backed gallery item) — reading it after
            // the modal is what produced the "Ошибка: read" reports.
            let bytes;
            try { bytes = new Uint8Array(await f.arrayBuffer()); }
            catch (e) { toastr.error('Не удалось прочитать файл — выберите его заново', 'Гардероб'); return; }
            let dataUrl = `data:${f.type || 'image/png'};base64,${swBytesToBase64(bytes)}`;
            // Wardrobe items are photographed garments, not portraits, so the
            // crop opens free-form rather than forcing them into a 3:4 frame.
            if (slayCropEnabled()) {
                const cropped = await slayCropImage(dataUrl, { aspect: 0, title: 'Обрезать вещь', subtitle: 'Можно оставить как есть' });
                if (cropped === null) return;
                dataUrl = cropped;
            }

            // Outfit-card import: if the picked PNG carries our tEXt chunk,
            // pre-fill the form and reuse the embedded description (skipping
            // the AI auto-describe — the card already knows what it is).
            const card = swParseOutfitCard(bytes, f.name);
            if (importMode && !card) {
                toastr.error('В этом файле нет данных костюма. Если карточка приехала через галерею или мессенджер как «фото» — метаданные вырезаны. Передавайте PNG как файл/документ и выбирайте через «Файлы», а не из галереи.', '\u{1F9E5} Импорт костюма', { timeOut: 12000 });
                return;
            }

            // Show upload modal (pre-filled when importing a card)
            const result = await swShowUploadModal(defaultName, card);
            if (!result) return;

            try {
                const { base64, format } = await swResize(dataUrl, swGetSettings().maxDimension);
                let autoDesc = card?.description?.trim() || null;
                if (autoDesc) {
                    // Never apply an imported description sight-unseen: it ends up
                    // in the bot's prompt, so the user must see (and can defuse)
                    // whatever the card author embedded there.
                    const edited = await swShowDescInput('🧥 Описание из карточки (можете отредактировать)', autoDesc);
                    if (edited !== null) autoDesc = edited;
                } else if (swGetSettings().autoDescribe !== false) {
                    // Occupy the panel for the whole wait. Previously the form
                    // closed, the ordinary grid came back, and the only sign of
                    // life was a toast that expires after 15s — while the describe
                    // request can run a full minute. People assumed nothing had
                    // happened and started tapping things.
                    swShowInline(`<div style="padding:28px 12px;text-align:center;color:#f0a0c0;">
                        <i class="fa-solid fa-spinner iig-spin-anim" style="font-size:26px;"></i>
                        <div style="margin-top:12px;font-size:14px;">🤖 ИИ описывает образ...</div>
                        <div style="margin-top:4px;font-size:11px;color:#888;">это занимает до минуты, не закрывайте гардероб</div>
                    </div>`);
                    // No timeout here meant a model that never answered left the
                    // spinner up forever with the form slot held — a hang nobody
                    // had to do anything wrong to reach.
                    try {
                        autoDesc = await Promise.race([
                            swAnalyzeOutfit(base64, result.category),
                            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 120000)),
                        ]);
                    } catch (e) {
                        swLog('WARN', `describe failed or timed out: ${e?.message}`);
                        toastr.warning('ИИ не ответил — добавляю без описания', 'Гардероб', { timeOut: 4000 });
                        autoDesc = null;
                    } finally { swRestoreInline(); }
                    if (autoDesc) {
                        const edited = await swShowDescInput('🤖 Описание (можете отредактировать)', autoDesc);
                        if (edited !== null) autoDesc = edited;
                    }
                }
                const imagePath = await swSaveImageToFile(base64, `wardrobe_${result.name}`, format);
                swAddItem({
                    id: uid(),
                    name: result.name,
                    description: (autoDesc || '').trim(),
                    imagePath,
                    base64: '',
                    category: result.category,
                    forWho: result.forWho || 'all',
                    gender: result.gender || 'unisex',
                    tags: result.tags,
                    addedAt: Date.now(),
                });
                // Switch to the uploaded item's category
                swCatTab = result.category;
                swRender();
                toastr.success(`\u00AB${result.name}\u00BB ${card ? 'импортирован' : 'добавлен'}`, 'Гардероб');
            } catch (e) { toastr.error('Ошибка: ' + e.message, 'Гардероб'); }
        });
        // Safari only opens the picker for an input that is in the document.
        inp.style.display = 'none';
        document.body.appendChild(inp);
        inp.click();
        setTimeout(() => inp.remove(), 60000);
    }

    async function swEdit(id) {
        const o = swFindItem(id); if (!o) return;
        const result = await swShowEditModal(o);
        if (!result) return;
        o.name = result.name || o.name;
        o.description = result.description ?? o.description;
        o.category = result.category || o.category;
        o.forWho = result.forWho || 'all';
        o.gender = result.gender || 'unisex';
        o.tags = result.tags || o.tags;
        swSave();
        swRender();
        swUpdatePromptInjection();
        toastr.info('Обновлён', 'Гардероб');
    }

    async function swRegenDescription(id) {
        const o = swFindItem(id); if (!o) return;
        const imgBase64 = o.imagePath ? await swLoadImageAsBase64(o.imagePath) : o.base64;
        if (!imgBase64) { toastr.error('Картинка не найдена', 'Гардероб'); return; }
        const autoDesc = await swAnalyzeOutfit(imgBase64, o.category);
        if (autoDesc) {
            const edited = await swShowDescInput('🤖 Описание (можете отредактировать)', autoDesc);
            if (edited) {
                o.description = edited; swSave(); swRender(); swUpdatePromptInjection();
                toastr.success('Описание обновлено', 'Гардероб', { timeOut: 2000 });
            }
        }
    }

    // ── Prompt injection ──
    const SW_PROMPT_KEY = 'slaywardrobe_outfit';

    function swUpdatePromptInjection() {
        try {
            const ctx = SillyTavern.getContext();
            if (typeof ctx.setExtensionPrompt !== 'function') { swLog('WARN', 'setExtensionPrompt not available'); return; }
            if (swGetSettings().wardrobeEnabled === false) { ctx.setExtensionPrompt(SW_PROMPT_KEY, '', 1, 0); return; }
            const cn = swCharName();
            if (!cn) { ctx.setExtensionPrompt(SW_PROMPT_KEY, '', 1, 0); return; }
            const co = swGetCharOutfit();
            if (!co) { ctx.setExtensionPrompt(SW_PROMPT_KEY, '', 1, 0); return; }

            const lines = [];
            for (const type of ['bot', 'user']) {
                const who = type === 'bot' ? cn : '{{user}}';
                const desc = swBuildDescription(type, cn);
                if (desc) {
                    lines.push(`[OUTFIT LOCK \u2014 keep unchanged: ${who} is currently wearing: ${desc}. Always use this exact outfit when writing image prompts for ${who}.]`);
                }
            }

            const injectionText = lines.length > 0 ? lines.join('\n') : '';
            ctx.setExtensionPrompt(SW_PROMPT_KEY, injectionText, 1, 0);
            if (injectionText) { swLog('INFO', `Prompt injection updated (MANDATORY depth=0): ${lines.length} outfit(s)`); }
            else { swLog('INFO', 'Prompt injection cleared (no active outfits)'); }
        } catch (e) { swLog('ERROR', 'Failed to update prompt injection:', e.message); }
    }

    // ── Bar button ──
    // Hover-preview is DESKTOP-ONLY. Mobile browsers synthesize mouseenter
    // from taps (and some withhold the click when hover mutates the DOM), so
    // without this guard a tap on the bar button opened the PC hover popup
    // instead of the wardrobe modal. Checked at event time, not bind time —
    // handles device-mode changes (e.g. DevTools emulation, convertibles).
    const swCanHover = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    let swHoverShowTimer = null;
    let swAutoCloseTimer = null;  // dismiss timer after cursor leaves popup
    const SW_AUTOCLOSE_MS = 5000;

    // Persist last-used Quick-Swap tab across popup open/close + sessions.
    let swPreviewTab = (() => {
        try { return localStorage.getItem('slay_wardrobe_preview_tab') === 'bot' ? 'bot' : 'user'; }
        catch (e) { return 'user'; }
    })();
    function swSetPreviewTab(tab) {
        swPreviewTab = tab;
        try { localStorage.setItem('slay_wardrobe_preview_tab', tab); } catch (e) { }
    }


    function swInjectFloatingBtn() {
        if (swGetSettings().wardrobeEnabled === false) { $('#sw-bar-btn').remove(); return; }
        let $btn = $('#sw-bar-btn');
        if ($btn.length === 0) {
            $btn = $('<div id="sw-bar-btn" title="Гардероб"><i class="fa-solid fa-shirt"></i></div>');
            const btnEl = $btn.get(0);

            // Click/tap always opens the full wardrobe. If popup happens to be
            // open (opened earlier via hover) — close it first so it doesn't
            // linger on top of the modal. No toggle-close through the button:
            //   - "navигated to button, wanted wardrobe" must always work in one click
            //   - popup closes via X / outside click / Escape (enough ways)
            btnEl.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                clearTimeout(swHoverShowTimer);
                swClosePreviewPopup();
                swOpenModal();
            });

            // ── Hover: opens popup after 500ms intent debounce. Fast
            // click-intent users never see the popup; deliberate pause triggers.
            btnEl.addEventListener('mouseenter', () => {
                if (!swCanHover()) return;
                clearTimeout(swHoverShowTimer);
                clearTimeout(swAutoCloseTimer);
                swHoverShowTimer = setTimeout(() => swOpenPreviewPopup(btnEl), 500);
            });
            btnEl.addEventListener('mouseleave', () => {
                clearTimeout(swHoverShowTimer);
                // If popup is currently open, restart the auto-close countdown
                // when cursor leaves the bar button. Without this, a user who
                // moved popup→button→away would stall the popup open forever
                // (popup mouseleave already fired before they reached button,
                // then button mouseenter cancelled the timer).
                const pp = document.getElementById('sw-preview-popup');
                if (pp?.classList.contains('sw-pp-open') && !pp.matches(':hover')) {
                    clearTimeout(swAutoCloseTimer);
                    swAutoCloseTimer = setTimeout(swClosePreviewPopup, SW_AUTOCLOSE_MS);
                }
            });

            const $left = $('#leftSendForm');
            if ($left.length) $left.append($btn); else $('body').append($btn);
        }
        const co = swGetCharOutfit();
        // Badge = currently worn parts across bot+user. Respects per-type mode so a
        // full counts as 1 (not 1 + parts), because parts are preserved in storage
        // even after a quick-swap to full.
        const count = co ? swCountWornParts() : 0;
        $btn.toggleClass('sw-bar-active', count > 0);
        if (count > 0) {
            $btn.html(`<i class="fa-solid fa-shirt"></i><span class="sw-bar-count">${count}</span>`);
        } else { $btn.html('<i class="fa-solid fa-shirt"></i>'); }
        $btn.show();
    }

    // ╔════════════════════════════════════════════════════════════════════╗
    // ║  Preview popup + Quick-Swap (v4.3)                                 ║
    // ╚════════════════════════════════════════════════════════════════════╝
    // Shown on hover (desktop) / long-press (mobile) on the wardrobe bar button.
    // Contents: currently-worn preview for bot+user + quick-swap buttons grouped
    // by tag. Mobile falls back to a bottom-sheet layout via CSS media query.

    const SW_TAG_ICONS = Object.freeze({
        home: '🏠', street: '👟', evening: '🌙',
        sleep: '💤', sport: '💪', beach: '🏖', other: '✨',
    });

    function swPreviewPopupEl() {
        let el = document.getElementById('sw-preview-popup');
        if (!el) {
            el = document.createElement('div');
            el.id = 'sw-preview-popup';
            el.className = 'sw-preview-popup';
            document.body.appendChild(el);
            // ── Dismissal paths:
            //   1. click outside popup (but not on bar-btn — bar-btn handler owns that)
            //   2. X close button inside popup
            //   3. Escape key
            //   4. mouseleave for SW_AUTOCLOSE_MS (5s)
            document.addEventListener('click', (e) => {
                if (!el.classList.contains('sw-pp-open')) return;
                if (el.contains(e.target)) return;
                if (e.target.closest('#sw-bar-btn')) return;
                swClosePreviewPopup();
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && el.classList.contains('sw-pp-open')) {
                    swClosePreviewPopup();
                }
            });

            // ── Auto-dismiss: cursor left the popup for SW_AUTOCLOSE_MS → close.
            // Entering the popup cancels the timer.
            el.addEventListener('mouseenter', () => clearTimeout(swAutoCloseTimer));
            el.addEventListener('mouseleave', () => {
                clearTimeout(swAutoCloseTimer);
                swAutoCloseTimer = setTimeout(swClosePreviewPopup, SW_AUTOCLOSE_MS);
            });

            // ── Event-bubbling containment (bound ONCE on the permanent element).
            // Previously this was re-added on every swRenderPreviewPopup() call
            // which stacked duplicate listeners on the same element after each
            // swap — textbook leak. Now the element is stable; listener set is
            // fixed size.
            const stop = e => e.stopPropagation();
            el.addEventListener('touchstart', stop, { passive: true });
            el.addEventListener('touchend', stop, { passive: true });
            el.addEventListener('pointerdown', stop);
            el.addEventListener('pointerup', stop);
            el.addEventListener('mousedown', stop);

        }
        return el;
    }

    // Anchor rect remembered across re-positions (e.g. after sub-picker expand)
    let swPopupAnchorRect = null;

    function swRepositionPopup() {
        const el = document.getElementById('sw-preview-popup');
        if (!el || !el.classList.contains('sw-pp-open') || !swPopupAnchorRect) return;
        const r = swPopupAnchorRect;
        el.style.visibility = 'hidden';
        el.style.left = '0px';
        el.style.top = '0px';
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        const vh = window.innerHeight;
        let left = r.right - w;
        let top = r.top - h - 10;
        if (left < 8) left = 8;
        // If popup doesn't fit above the button, anchor its BOTTOM to just
        // above the button instead — so when sub-picker expands the popup
        // stretches upward, not off-screen below.
        if (top < 8) top = Math.max(8, vh - h - 10);
        el.style.left = left + 'px';
        el.style.top = top + 'px';
        el.style.visibility = '';
    }

    function swOpenPreviewPopup(anchor) {
        const el = swPreviewPopupEl();
        swRenderPreviewPopup();
        swPopupAnchorRect = anchor.getBoundingClientRect();
        el.classList.add('sw-pp-open');
        swRepositionPopup();
    }

    function swClosePreviewPopup() {
        clearTimeout(swAutoCloseTimer);
        const el = document.getElementById('sw-preview-popup');
        if (el) el.classList.remove('sw-pp-open');
        swHidePeek?.();  // also drop any lingering hold-to-zoom preview
    }

    // Render preview thumbnails (bot + user) + quick-swap categories for the
    // currently-selected swPreviewTab. Called on every open + after swaps.
    function swRenderPreviewPopup() {
        // Before the old DOM gets blown away by innerHTML, make sure no peek
        // timers (set by mouseenter on old tiles) can still fire.
        swCancelPendingPeekTimers();
        const el = swPreviewPopupEl();
        const co = swGetCharOutfit();
        const cn = swCharName();
        if (!cn) {
            el.innerHTML = `<div class="sw-pp-empty">Выберите персонажа</div>`;
            return;
        }
        const botItem = swGetTopWornItem('bot');
        const userItem = swGetTopWornItem('user');
        // Thumb backgrounds are set from JS (data-src → .style.backgroundImage)
        // instead of inline CSS to avoid url() escape bugs on paths with spaces,
        // parens, backslashes, unicode.
        const renderSlot = (type, item) => {
            const label = type === 'bot' ? '{{char}}' : '{{user}}';
            if (!item) {
                return `<div class="sw-pp-slot sw-pp-slot-empty" data-type="${type}">
                    <div class="sw-pp-thumb sw-pp-thumb-empty"><i class="fa-solid fa-shirt"></i></div>
                    <div class="sw-pp-slot-label">${label}</div>
                    <div class="sw-pp-slot-sub">— пусто —</div>
                </div>`;
            }
            const src = swGetOutfitSrc(item) || '';
            const mode = swGetModeFor(type);
            const sub = mode === 'full'
                ? (CATEGORIES[item.category] || 'Полный')
                : 'По частям';
            const safeSrcAttr = esc(src);
            return `<div class="sw-pp-slot" data-type="${type}" data-src="${safeSrcAttr}">
                <div class="sw-pp-thumb"></div>
                <div class="sw-pp-slot-label">${label}</div>
                <div class="sw-pp-slot-sub" title="${esc(item.name)}">${esc(item.name)}</div>
                <div class="sw-pp-slot-meta">${sub}</div>
            </div>`;
        };

        const byTag = swGroupFullsByTag(swPreviewTab);
        // Only show tags that have at least 1 visible item — clutter-free UX
        const activeTags = TAG_KEYS.filter(tk => byTag[tk].length > 0);

        const catButtons = activeTags.map(tk => {
            const items = byTag[tk];
            const multi = items.length > 1 ? ' sw-pp-cat-multi' : '';
            return `<button class="sw-pp-cat-btn${multi}" data-tag="${tk}" title="${TAGS[tk]} (${items.length})">
                <span class="sw-pp-cat-ico">${SW_TAG_ICONS[tk] || '✨'}</span>
                <span class="sw-pp-cat-count">${items.length}</span>
            </button>`;
        }).join('');

        el.innerHTML = `
            <button class="sw-pp-close" title="Закрыть" aria-label="Закрыть"><i class="fa-solid fa-xmark"></i></button>
            <div class="sw-pp-body">
                <div class="sw-pp-screen sw-pp-screen-main">
                    <div class="sw-pp-section sw-pp-section-preview">
                        <div class="sw-pp-title">Сейчас надето</div>
                        <div class="sw-pp-preview-grid">
                            ${renderSlot('bot', botItem)}
                            ${renderSlot('user', userItem)}
                        </div>
                    </div>
                    <div class="sw-pp-section sw-pp-section-swap">
                        <div class="sw-pp-title">Быстрая смена <span class="sw-pp-title-sub">(${swPreviewTab === 'bot' ? 'Бот' : 'Юзер'})</span></div>
                        <div class="sw-pp-cats">
                            ${catButtons || '<div class="sw-pp-empty-line">Нет полных комплектов</div>'}
                        </div>
                    </div>
                </div>
                <div class="sw-pp-screen sw-pp-screen-sub" hidden>
                    <div class="sw-pp-subgrid-head">
                        <button class="sw-pp-sub-back" title="К категориям"><i class="fa-solid fa-arrow-left"></i></button>
                        <span class="sw-pp-subgrid-title"></span>
                    </div>
                    <div class="sw-pp-subgrid-items"></div>
                </div>
            </div>
            <div class="sw-pp-footer">
                <div class="sw-pp-tabs">
                    <button class="sw-pp-tab${swPreviewTab === 'user' ? ' sw-pp-tab-active' : ''}" data-tab="user">👤 Юзер</button>
                    <button class="sw-pp-tab${swPreviewTab === 'bot' ? ' sw-pp-tab-active' : ''}" data-tab="bot">🤖 Бот</button>
                </div>
                <button class="sw-pp-open-full"><i class="fa-solid fa-shirt"></i> Открыть гардероб</button>
            </div>
        `;

        // ── Wire events ──
        el.querySelector('.sw-pp-close')?.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation(); swClosePreviewPopup();
        });
        el.querySelector('.sw-pp-open-full')?.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            swClosePreviewPopup();
            swOpenModal();
        });
        // Preview slot click → open full wardrobe on that type's tab
        el.querySelectorAll('.sw-pp-slot').forEach(slot => {
            slot.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                const type = slot.dataset.type;
                swTab = type;
                swClosePreviewPopup();
                swOpenModal();
            });
        });
        // Tab switch (bot/user for Quick-Swap target). Persists choice.
        el.querySelectorAll('.sw-pp-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                swSetPreviewTab(tab.dataset.tab);
                swRenderPreviewPopup();
            });
        });
        // Category button click → always open sub-picker, never instant-equip.
        el.querySelectorAll('.sw-pp-cat-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                const tk = btn.dataset.tag;
                const items = byTag[tk] || [];
                if (items.length > 0) swShowSubgrid(tk, items);
            });
        });
        // Apply thumbs via JS-set style (dodges CSS url() escaping hell —
        // paths with (), backslashes, spaces, unicode all survive).
        for (const slot of el.querySelectorAll('.sw-pp-slot')) {
            const src = slot.dataset.src;
            const thumb = slot.querySelector('.sw-pp-thumb');
            if (src && thumb && !thumb.classList.contains('sw-pp-thumb-empty')) {
                thumb.style.backgroundImage = `url("${src.replace(/"/g, '\\"')}")`;
            }
        }

    }

    // Step-based navigation: tap a multi-outfit category → swap the main screen
    // (preview+categories) out for the sub-picker screen (back-button + items).
    // Popup size stays constant; only the sub-picker's own grid scrolls if the
    // tag has many outfits. Back button returns to the main screen.
    function swShowSubgrid(tagKey, items) {
        // Re-rendering the tiles set → any pending peek timers from previous
        // sub-picker state become stale. Flush them.
        swCancelPendingPeekTimers();
        const el = swPreviewPopupEl();
        const main = el.querySelector('.sw-pp-screen-main');
        const sub = el.querySelector('.sw-pp-screen-sub');
        const titleEl = el.querySelector('.sw-pp-subgrid-title');
        const grid = el.querySelector('.sw-pp-subgrid-items');
        if (!sub || !grid || !main) return;
        titleEl.textContent = `${TAGS[tagKey] || tagKey} — выбери (${items.length})`;
        // Name captions intentionally dropped — thumbnails alone are enough
        // (per user feedback: "ебало есть, и глаза, и так все увидим").
        // Only the favourite star overlays.
        grid.innerHTML = items.map(item => {
            const fav = item.favourite ? '<span class="sw-pp-sub-fav">★</span>' : '';
            return `<div class="sw-pp-sub-item" data-id="${item.id}" title="${esc(item.name)}">${fav}</div>`;
        }).join('');
        // Set backgrounds via JS so path escaping doesn't bite us
        const itemById = new Map(items.map(i => [i.id, i]));
        for (const node of grid.querySelectorAll('.sw-pp-sub-item')) {
            const item = itemById.get(node.dataset.id);
            if (!item) continue;
            const src = swGetOutfitSrc(item);
            if (src) node.style.backgroundImage = `url("${src.replace(/"/g, '\\"')}")`;
        }
        main.hidden = true;
        sub.hidden = false;
        // Back button: re-use the single permanent listener via data-wired flag
        // so opening the sub-picker many times doesn't stack duplicates.
        const backBtn = el.querySelector('.sw-pp-sub-back');
        if (backBtn && backBtn.dataset.wired !== '1') {
            backBtn.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                sub.hidden = true;
                main.hidden = false;
            });
            backBtn.dataset.wired = '1';
        }
        grid.querySelectorAll('.sw-pp-sub-item').forEach(node => {
            swBindPeek(node);
            node.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                if (node.dataset.peekSuppress === '1') {
                    delete node.dataset.peekSuppress;
                    return;
                }
                const id = node.dataset.id;
                const item = swFindItem(id);
                if (item) swApplyQuickSwap(item);
            });
        });
    }

    // ── Peek (hold-to-zoom) ───────────────────────────────────────────────
    // Hover a sub-picker tile for 500ms → floating enlarged preview appears.
    // Mouseleave → dismiss. Only ever triggered from inside the desktop
    // popup (mobile popup is disabled entirely), so no touch path needed.

    // Track all pending peek timers globally. Re-rendering the popup or
    // applying a swap detaches the old tiles but pending setTimeouts keep
    // firing — those then show peek against a detached node whose rect is
    // (0,0,0,0), parking a stuck preview in the top-left corner. Killing
    // all pending timers on apply/hide/render eliminates that race.
    const swPeekTimers = new Set();
    function swCancelPendingPeekTimers() {
        for (const t of swPeekTimers) clearTimeout(t);
        swPeekTimers.clear();
    }

    function swBindPeek(tileEl) {
        let hoverTimer = null;
        const showPeek = () => {
            swPeekTimers.delete(hoverTimer);
            // Guard against the race described above: tile was removed from
            // DOM (sub-picker re-render, popup close) before the 500ms hover
            // timer fired. getBoundingClientRect would return (0,0) and park
            // a stray peek in the viewport corner.
            if (!tileEl.isConnected) return;
            const id = tileEl.dataset.id;
            const item = swFindItem(id);
            if (!item) return;
            swShowPeek(tileEl, item);
        };

        tileEl.addEventListener('mouseenter', () => {
            // Same desktop-only guard as the bar button: taps synthesize
            // mouseenter, which would park a hover-peek over the tapped tile.
            if (!swCanHover()) return;
            clearTimeout(hoverTimer);
            swPeekTimers.delete(hoverTimer);
            hoverTimer = setTimeout(showPeek, 500);
            swPeekTimers.add(hoverTimer);
        });
        tileEl.addEventListener('mouseleave', () => {
            clearTimeout(hoverTimer);
            swPeekTimers.delete(hoverTimer);
            swHidePeek();
        });
    }

    function swShowPeek(tileEl, item) {
        swHidePeek();  // only one at a time
        const src = swGetOutfitSrc(item);
        if (!src) return;
        const peek = document.createElement('div');
        peek.className = 'sw-pp-peek';
        peek.innerHTML = `
            <div class="sw-pp-peek-img"></div>
            <div class="sw-pp-peek-name">${esc(item.name)}${item.favourite ? ' <span class="sw-pp-peek-fav">★</span>' : ''}</div>
        `;
        // Background via JS — same reason as tiles: paths with special chars
        // break inline CSS url().
        peek.querySelector('.sw-pp-peek-img').style.backgroundImage =
            `url("${String(src).replace(/"/g, '\\"')}")`;
        document.body.appendChild(peek);
        // Size — large enough to inspect, small enough to fit on mobile
        const PW = Math.min(260, window.innerWidth - 32);
        const PH = Math.round(PW * 4 / 3) + 32; // +32 for caption strip
        peek.style.width = PW + 'px';
        const r = tileEl.getBoundingClientRect();
        let left = r.left + r.width / 2 - PW / 2;
        let top = r.top + r.height / 2 - PH / 2;
        // Clamp to viewport with a small margin
        left = Math.max(8, Math.min(left, window.innerWidth - PW - 8));
        top = Math.max(8, Math.min(top, window.innerHeight - PH - 8));
        peek.style.left = left + 'px';
        peek.style.top = top + 'px';
        requestAnimationFrame(() => peek.classList.add('sw-pp-peek-show'));
    }

    function swHidePeek() {
        // Kill any pending setTimeouts that would otherwise fire against a
        // tile that's already been removed from DOM (detached bounding rect
        // parks the peek in the viewport corner — "стуck в углу" bug).
        swCancelPendingPeekTimers();
        document.querySelectorAll('.sw-pp-peek').forEach(p => p.remove());
    }

    // Apply a full outfit to the currently-selected swPreviewTab's figure, keep
    // parts preserved. Surgical update: navigate back to main screen and patch
    // only the two preview slots instead of rebuilding the entire popup
    // (eliminates the full-popup DOM flash, keeps scroll position, cheaper).
    function swApplyQuickSwap(item) {
        const type = swPreviewTab;
        swQuickSwapFull(type, item.id);
        swHidePeek();
        const el = document.getElementById('sw-preview-popup');
        if (el) {
            // Back to main screen from sub-picker
            const main = el.querySelector('.sw-pp-screen-main');
            const sub = el.querySelector('.sw-pp-screen-sub');
            if (sub) sub.hidden = true;
            if (main) main.hidden = false;
            // Patch preview slots only (fresh top-worn thumbnail + caption)
            swUpdatePreviewSlots(el);
        }
        swShowQuickSwapToast(item.name, type);
    }

    // Rebuild only the two preview slots inside the preview-grid of an open
    // popup. Cheaper than swRenderPreviewPopup() and avoids a full DOM flash.
    function swUpdatePreviewSlots(root) {
        const grid = root.querySelector('.sw-pp-preview-grid');
        if (!grid) return;
        const render = (type) => {
            const item = swGetTopWornItem(type);
            const label = type === 'bot' ? '{{char}}' : '{{user}}';
            if (!item) {
                return `<div class="sw-pp-slot sw-pp-slot-empty" data-type="${type}">
                    <div class="sw-pp-thumb sw-pp-thumb-empty"><i class="fa-solid fa-shirt"></i></div>
                    <div class="sw-pp-slot-label">${label}</div>
                    <div class="sw-pp-slot-sub">— пусто —</div>
                </div>`;
            }
            const src = swGetOutfitSrc(item) || '';
            const mode = swGetModeFor(type);
            const sub = mode === 'full' ? (CATEGORIES[item.category] || 'Полный') : 'По частям';
            return `<div class="sw-pp-slot" data-type="${type}" data-src="${esc(src)}">
                <div class="sw-pp-thumb"></div>
                <div class="sw-pp-slot-label">${label}</div>
                <div class="sw-pp-slot-sub" title="${esc(item.name)}">${esc(item.name)}</div>
                <div class="sw-pp-slot-meta">${sub}</div>
            </div>`;
        };
        grid.innerHTML = render('bot') + render('user');
        // Attach thumb bg + click handlers (same as in swRenderPreviewPopup)
        for (const slot of grid.querySelectorAll('.sw-pp-slot')) {
            const src = slot.dataset.src;
            const thumb = slot.querySelector('.sw-pp-thumb');
            if (src && thumb && !thumb.classList.contains('sw-pp-thumb-empty')) {
                thumb.style.backgroundImage = `url("${src.replace(/"/g, '\\"')}")`;
            }
            slot.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                const type = slot.dataset.type;
                swTab = type;
                swClosePreviewPopup();
                swOpenModal();
            });
        }
    }

    function swShowQuickSwapToast(name, type) {
        const who = type === 'bot' ? 'бот' : 'юзер';
        if (typeof toastr !== 'undefined') {
            toastr.success(`Надето на ${who}: ${name}`, 'Гардероб', { timeOut: 1500 });
        }
    }

    // ── Public API ──
    // Compare what's on disk in wardrobe_refs against what any item actually
    // references, and offer to remove the leftovers. Deliberately a manual,
    // report-first action rather than a silent sweep — if our accounting is ever
    // wrong, the user sees the number before anything is deleted.
    // Sweep BOTH picture folders, not just the wardrobe's. iig_refs holds every
    // character reference ever uploaded — hundreds of files in a long-running
    // install — and nothing had ever looked at it. Now that slayCountPathUses()
    // knows every place a path can be referenced (saved looks, all wardrobes,
    // ref slots across every chat, the recent ribbon), one pass can cover the
    // lot. Still report-then-confirm: a wrong count here deletes real work.
    async function swFindOrphanImages() {
        const ctx = SillyTavern.getContext();
        const folders = [
            { name: 'wardrobe_refs', label: 'гардероб' },
            { name: 'iig_refs',      label: 'референсы' },
        ];
        const t = toastr.info('Сверяю файлы со всеми списками...', 'Гардероб', { timeOut: 0, extendedTimeOut: 0 });
        try {
            const found = [];
            let total = 0;
            for (const f of folders) {
                const r = await fetch('/api/images/list', {
                    method: 'POST', headers: ctx.getRequestHeaders(),
                    body: JSON.stringify({ folder: f.name })
                });
                if (!r.ok) { swLog('WARN', `orphan scan: ${f.name} list failed (${r.status})`); continue; }
                const files = await r.json();
                if (!Array.isArray(files)) continue;
                for (const raw of files) {
                    const name = String(typeof raw === 'string' ? raw : (raw && raw.name) || '').split('/').pop();
                    if (!name) continue;
                    total++;
                    const path = `/user/images/${f.name}/${name}`;
                    if (slayCountPathUses(path) === 0) found.push({ path, folder: f.label });
                }
            }
            try { toastr.clear(t); } catch (_) {}

            if (!total) { toastr.info('Картинок на диске не найдено', 'Гардероб'); return; }
            if (!found.length) {
                toastr.success(`Лишних нет — все ${total} картинок используются`, 'Гардероб', { timeOut: 4000 });
                return;
            }

            const nWard = found.filter(x => x.folder === 'гардероб').length;
            const nRefs = found.filter(x => x.folder === 'референсы').length;
            const byFolder = found.reduce((acc, x) => { acc[x.folder] = (acc[x.folder] || 0) + 1; return acc; }, {});
            const breakdown = Object.entries(byFolder).map(([k, v]) => `· ${v} в разделе «${k}»`).join('\n');
            // Three outcomes, not two: someone may well want to clear hundreds of
            // stale references while keeping every wardrobe picture, or the other
            // way round. Forcing that into one yes/no was the wrong question.
            const opts = [];
            if (nRefs) opts.push({ key: 'refs', label: `Только референсы (${nRefs})` });
            if (nWard) opts.push({ key: 'ward', label: `Только гардероб (${nWard})` });
            if (nRefs && nWard) opts.push({ key: 'both', label: `И то и другое (${found.length})`, danger: true });
            else if (opts.length === 1) opts[0].primary = true;

            const pick = await slayChoose(
                'Ничьи картинки',
                `Проверено ${total} картинок во всех папках.@BR@@BR@` +
                `На ${found.length} не ссылается ничего — ни вещь гардероба, ни сохранённый образ, ни слот персонажа ни в одном чате.@BR@@BR@` +
                `Что удалить с диска?`,
                opts);
            if (!pick) return;
            const doomed = pick === 'both' ? found
                : pick === 'refs' ? found.filter(x => x.folder === 'референсы')
                : found.filter(x => x.folder === 'гардероб');
            if (!doomed.length) return;

            const t2 = toastr.info('Удаляю...', 'Гардероб', { timeOut: 0, extendedTimeOut: 0 });
            let killed = 0;
            for (const x of doomed) {
                const res = await fetch('/api/images/delete', {
                    method: 'POST', headers: ctx.getRequestHeaders(),
                    body: JSON.stringify({ path: x.path.replace(/^[/]/, '') })
                });
                if (res.ok) killed++;
            }
            try { toastr.clear(t2); } catch (_) {}
            toastr.success(`Удалено ${killed} из ${doomed.length}`, 'Гардероб', { timeOut: 5000 });
        } catch (e) {
            try { toastr.clear(t); } catch (_) {}
            toastr.error('Ошибка: ' + (e?.message || e), 'Гардероб');
        }
    }

    window.slayWardrobe = {
        // Re-apply the wardrobe's own on/off state without a page reload:
        // clears or restores the prompt injection and the chat bar button.
        refresh() { swUpdatePromptInjection(); swInjectFloatingBtn(); },
        findOrphanImages: swFindOrphanImages,
        async getActiveOutfitBase64(type) {
            const cn = swCharName(); if (!cn) return null;
            const co = swGetCharOutfit(); if (!co) return null;
            const mode = swGetModeFor(type);
            // Only return base64 if mode=full and full item equipped
            if (mode !== 'full') return null;
            const fullId = co[type]?.full;
            if (!fullId) return null;
            const outfit = swFindItem(fullId);
            if (!outfit) return null;
            if (outfit.imagePath) return await swLoadImageAsBase64(outfit.imagePath);
            return outfit.base64 || null;
        },
        getActiveOutfitDescription(type) {
            const cn = swCharName(); if (!cn) return '';
            return swBuildDescription(type, cn);
        },
        async getCollageBase64(type) {
            if (!swGetSettings().experimentalCollage) return null;
            // 1 item = return as single ref; 2+ = collage
            const images = await swGetPartsImages(type);
            if (images.length === 1) return images[0]; // single item, no collage needed
            if (images.length >= 2) return await swBuildCollage(type);
            return null;
        },
        getActiveOutfitData(type) {
            const cn = swCharName(); if (!cn) return null;
            const co = swGetCharOutfit(); if (!co) return null;
            const result = {};
            for (const cat of CAT_KEYS) {
                const itemId = co[type]?.[cat] || null;
                result[cat] = itemId ? swFindItem(itemId) : null;
            }
            return result;
        },
        openModal: () => swOpenModal(),
        isReady: () => true,
        applyModalWidth: () => swApplyModalWidth(),
    };

    // ── Init hooks ──
    const ctx = SillyTavern.getContext();
    ctx.eventSource.on(ctx.event_types.APP_READY, () => {
        swApplyModalWidth();
        setTimeout(() => { swUpdatePromptInjection(); swInjectFloatingBtn(); }, 500);
    });
    ctx.eventSource.on(ctx.event_types.CHAT_CHANGED, () => {
        setTimeout(() => { swUpdatePromptInjection(); swInjectFloatingBtn(); }, 300);
    });
    // Refresh outfit prompt injection RIGHT BEFORE every LLM request. Fixes
    // intermittent "wardrobe description missing" cases (CHAT_CHANGED race,
    // swipe/regen, preset that rebuilds messages array). Guarantees current
    // outfit description is present for every single generation.
    if (ctx.event_types.GENERATION_STARTED) {
        ctx.eventSource.on(ctx.event_types.GENERATION_STARTED, () => {
            try { swUpdatePromptInjection(); } catch (e) { swLog('WARN', 'GENERATION_STARTED injection refresh failed:', e.message); }
        });
    }
    swLog('INFO', 'SlayWardrobe v4 initialized');
})();


/* ╔═══════════════════════════════════════════════════════════════╗
   ║  MODULE 2: Core Engine (Inline Image Generation + NPC Refs)   ║
   ╚═══════════════════════════════════════════════════════════════╝ */

const MODULE_NAME = 'slay_image_gen';

const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const FETCH_TIMEOUT = IS_IOS ? 180000 : 300000;

function robustFetch(url, options = {}) {
    if (!IS_IOS) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
        return fetch(url, { ...options, signal: controller.signal })
            .then(r => { clearTimeout(timeoutId); return r; })
            .catch(e => { clearTimeout(timeoutId); if (e.name === 'AbortError') throw new Error('Request timed out after 5 minutes'); throw e; });
    }
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(options.method || 'GET', url);
        xhr.timeout = FETCH_TIMEOUT;
        xhr.responseType = 'text';
        if (options.headers) { for (const [key, value] of Object.entries(options.headers)) { xhr.setRequestHeader(key, value); } }
        xhr.onload = () => { resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, statusText: xhr.statusText, text: () => Promise.resolve(xhr.responseText), json: () => Promise.resolve(JSON.parse(xhr.responseText)), headers: { get: (name) => xhr.getResponseHeader(name) } }); };
        xhr.ontimeout = () => reject(new Error('Request timed out after 3 minutes (iOS)'));
        xhr.onerror = () => reject(new Error('Network error (iOS)'));
        xhr.onabort = () => reject(new Error('Request aborted (iOS)'));
        xhr.send(options.body || null);
    });
}

const processingMessages = new Set();
const recentlyProcessed = new Map();
const REPROCESS_COOLDOWN_MS = 5000;
let _eventHandlerDepth = 0;
const MAX_EVENT_HANDLER_DEPTH = 2;

setInterval(() => {
    const now = Date.now();
    for (const [id, ts] of recentlyProcessed) {
        if (now - ts > REPROCESS_COOLDOWN_MS * 2) recentlyProcessed.delete(id);
    }
}, 30000);

let sessionGenCount = 0;
let sessionErrorCount = 0;

function updateSessionStats() {
    const el = document.getElementById('slay_session_stats');
    if (!el) return;
    if (sessionGenCount === 0 && sessionErrorCount === 0) { el.textContent = ''; return; }
    const parts = [];
    if (sessionGenCount > 0) parts.push(`${sessionGenCount} generated`);
    if (sessionErrorCount > 0) parts.push(`${sessionErrorCount} failed`);
    el.textContent = `Session: ${parts.join(' · ')}`;
}

const logBuffer = [];
const MAX_LOG_ENTRIES = 200;

function iigLog(level, ...args) {
    const timestamp = new Date().toISOString();
    const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    const entry = `[${timestamp}] [${level}] ${message}`;
    logBuffer.push(entry);
    if (logBuffer.length > MAX_LOG_ENTRIES) logBuffer.shift();
    if (level === 'ERROR') console.error('[IIG]', ...args);
    else if (level === 'WARN') console.warn('[IIG]', ...args);
    else console.log('[IIG]', ...args);
}

function exportLogs() {
    const logsText = logBuffer.join('\n');
    const blob = new Blob([logsText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `slay-iig-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`; a.click();
    URL.revokeObjectURL(url);
    toastr.success('Логи экспортированы', 'SLAY Images');
}

// ── Default settings (union of both extensions) ──
const defaultSettings = Object.freeze({
    enabled: true,
    externalBlocks: false,
    imageContextEnabled: false,
    // Offer the crop step when a picture is uploaded. Stored as the opt-OUT so
    // the checkbox can be worded the way it was asked for: «не предлагать кроп».
    skipCrop: false,
    // Whether the saved-characters panel is expanded. Closed by default so it
    // doesn't push the ref slots down for someone who never opens it.
    savedOpen: false,
    imageContextCount: 1,
    apiType: 'openai',
    // false = pick from the fetched list (a real <select>); true = type it in.
    // Forced on for providers that cannot list models, so nobody gets locked out.
    manualModel: false,
    endpoint: '',
    apiKey: '',
    model: '',
    // Saved connection profiles: [{name, apiType, endpoint, apiKey, model}].
    // Applying a profile copies its fields into the live settings — it's a
    // snapshot, not a live link; later edits don't write back to the profile.
    connectionProfiles: [],
    // Custom apiType: request body shape sent to the user-supplied full URL.
    // 'chat' = OpenAI chat/completions multimodal; 'images' = OpenAI
    // images/generations ({prompt, size, n, response_format}).
    customBodyFormat: 'chat',
    size: '1024x1024',
    quality: 'standard',
    maxRetries: 0,
    retryDelay: 1000,
    // Gemini/nano-banana
    sendCharAvatar: true,
    sendUserAvatar: true,
    userAvatarFile: '',
    // refMigratedV41 — sentinel for one-time migration to reset sticky false values
    refMigratedV41: false,
    aspectRatio: '1:1',
    imageSize: '1K',
    // Naistera
    naisteraAspectRatio: '1:1',
    naisteraPreset: '',
    naisteraModel: 'grok',
    // Style picker
    slayStyle: '',
    slayStyleName: '',
    naisteraSendCharAvatar: false,
    naisteraSendUserAvatar: false,
    naisteraVideoTest: false,
    naisteraVideoEveryN: 1,
    // NPC refs (flat storage)
    charRef: { name: '', imageBase64: '', imagePath: '' },
    userRef: { name: '', imageBase64: '', imagePath: '' },
    npcReferences: [],
});

const MAX_CONTEXT_IMAGES = 3;
const MAX_GENERATION_REFERENCE_IMAGES = 5;
const STYLE_BLOCK_RE = /\[\s*style\s*:\s*[^\]]*\]/gi;

function injectStyleBlock(prompt, styleValue) {
    const normalizedPrompt = String(prompt || '').trim();
    const normalizedStyle = String(styleValue || '').trim();
    if (!normalizedStyle) {
        return normalizedPrompt;
    }

    const styleBlock = `[STYLE: ${normalizedStyle}]`;
    if (!normalizedPrompt) {
        return styleBlock;
    }

    STYLE_BLOCK_RE.lastIndex = 0;
    if (STYLE_BLOCK_RE.test(normalizedPrompt)) {
        STYLE_BLOCK_RE.lastIndex = 0;
        let replacedFirst = false;
        return normalizedPrompt.replace(STYLE_BLOCK_RE, () => {
            if (replacedFirst) return '';
            replacedFirst = true;
            return styleBlock;
        }).trim();
    }

    return `${styleBlock}\n\n${normalizedPrompt}`.trim();
}

const IMAGE_MODEL_KEYWORDS = [
    'dall-e', 'midjourney', 'mj', 'journey', 'stable-diffusion', 'sdxl', 'flux',
    'imagen', 'drawing', 'paint', 'image', 'seedream', 'hidream', 'dreamshaper',
    'ideogram', 'nano-banana', 'gpt-image', 'wanx', 'qwen'
];
const VIDEO_MODEL_KEYWORDS = [
    'sora', 'kling', 'jimeng', 'veo', 'pika', 'runway', 'luma',
    'video', 'gen-3', 'minimax', 'cogvideo', 'mochi', 'seedance',
    'vidu', 'wan-ai', 'hunyuan', 'hailuo'
];

function isImageModel(modelId) {
    const mid = modelId.toLowerCase();
    for (const kw of VIDEO_MODEL_KEYWORDS) { if (mid.includes(kw)) return false; }
    if (mid.includes('vision') && mid.includes('preview')) return false;
    for (const kw of IMAGE_MODEL_KEYWORDS) { if (mid.includes(kw)) return true; }
    return false;
}

function isGeminiModel(modelId) {
    return modelId.toLowerCase().includes('nano-banana');
}

// ── Naistera/endpoint helpers (from sillyimages-master) ──
const NAISTERA_MODELS = Object.freeze(['grok', 'nano banana', 'grok-pro', 'novelai']);
const DEFAULT_ENDPOINTS = Object.freeze({ naistera: 'https://naistera.org' });
const ENDPOINT_PLACEHOLDERS = Object.freeze({ openai: 'https://api.openai.com', gemini: 'https://generativelanguage.googleapis.com', naistera: 'https://naistera.org', custom: 'https://api.example.com/ai/openai/image (полный URL)' });

function normalizeNaisteraModel(model) {
    const raw = String(model || '').trim().toLowerCase();
    if (!raw) return 'grok';
    if (raw === 'nano-banana' || raw === 'nano-banana-pro' || raw === 'nano-banana-2' || raw === 'nano banana pro' || raw === 'nano banana 2') return 'nano banana';
    if (NAISTERA_MODELS.includes(raw)) return raw;
    return 'grok';
}
function shouldUseNaisteraVideoTest(model) { const n = normalizeNaisteraModel(model); return n === 'grok' || n === 'nano banana'; }
function normalizeNaisteraVideoFrequency(value) { const n = Number.parseInt(String(value ?? '').trim(), 10); if (!Number.isFinite(n) || n < 1) return 1; return Math.min(n, 999); }
function normalizeImageContextCount(value) { const n = Number.parseInt(String(value ?? '').trim(), 10); if (!Number.isFinite(n) || n < 1) return 1; return Math.min(n, MAX_CONTEXT_IMAGES); }

function getAssistantMessageOrdinal(messageId) {
    const context = SillyTavern.getContext();
    const chat = Array.isArray(context?.chat) ? context.chat : [];
    let ordinal = 0;
    for (let i = 0; i < chat.length; i++) {
        const message = chat[i];
        if (!message || message.is_user || message.is_system) continue;
        ordinal += 1;
        if (i === messageId) return ordinal;
    }
    return Math.max(1, messageId + 1);
}
function shouldTriggerNaisteraVideoForMessage(messageId, everyN) {
    const n = normalizeNaisteraVideoFrequency(everyN);
    if (n <= 1) return true;
    return getAssistantMessageOrdinal(messageId) % n === 0;
}
function getEndpointPlaceholder(apiType) { return ENDPOINT_PLACEHOLDERS[apiType] || 'https://api.example.com'; }
function normalizeConfiguredEndpoint(apiType, endpoint) {
    const trimmed = String(endpoint || '').trim().replace(/\/+$/, '');
    if (!trimmed) return apiType === 'naistera' ? DEFAULT_ENDPOINTS.naistera : '';
    if (apiType === 'naistera') return trimmed.replace(/\/api\/generate$/i, '');
    return trimmed;
}
function shouldReplaceEndpointForApiType(apiType, endpoint) {
    const trimmed = String(endpoint || '').trim();
    if (!trimmed) return true;
    if (apiType !== 'naistera') return false;
    return /\/v1\/images\/generations\/?$/i.test(trimmed) || /\/v1\/models\/?$/i.test(trimmed) || /\/v1beta\/models\//i.test(trimmed);
}
function getEffectiveEndpoint(settings = getSettings()) {
    return normalizeConfiguredEndpoint(settings.apiType, settings.endpoint);
}

// ── Settings management ──
function getSettings() {
    const context = SillyTavern.getContext();
    if (!context.extensionSettings[MODULE_NAME]) context.extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(context.extensionSettings[MODULE_NAME], key)) context.extensionSettings[MODULE_NAME][key] = defaultSettings[key];
    }
    return context.extensionSettings[MODULE_NAME];
}

// Capture ST's original window.saveSettings lazily to avoid infinite recursion
// if our function shadows it in global scope
let _stSaveSettings = null;
let _stSaveSettingsCaptured = false;

function saveSettings() {
    if (!_stSaveSettingsCaptured) {
        _stSaveSettings = window.saveSettings;
        _stSaveSettingsCaptured = true;
    }
    const context = SillyTavern.getContext();
    if (typeof _stSaveSettings === 'function' && _stSaveSettings !== saveSettings) {
        try { _stSaveSettings(); } catch (e) { context.saveSettingsDebounced(); }
    } else {
        context.saveSettingsDebounced();
    }
    persistRefsToLocalStorage();
}
function saveSettingsNow() { saveSettings(); }

const LS_KEY = 'slay_iig_refs_v1';

// Crash insurance for mobile: phones discard backgrounded tabs, sometimes before
// ST has written settings to the server. The backup used to cover only the LEGACY
// flat npcReferences field, while real refs live in perCharacterRefs — so it was
// protecting almost nothing. Both go in now.
// Everything worth not losing to a killed tab. JSON.stringify walks the live
// objects directly — the old code cloned them first and threw the clone away one
// line later, which was 75% of the work this function did.
const LS_BACKUP_KEYS = ['npcReferences', 'perCharacterRefs', 'savedChars', 'refHashMap', 'recentRefs'];

function persistRefsToLocalStorage() {
    let settings;
    try { settings = getSettings(); } catch (e) { return; }
    const build = (keys) => {
        const payload = { savedAt: Date.now() };
        for (const k of keys) if (settings[k] !== undefined) payload[k] = settings[k];
        return JSON.stringify(payload);
    };
    try {
        localStorage.setItem(LS_KEY, build(LS_BACKUP_KEYS));
    } catch (e) {
        // Out of quota: drop the hash map (rebuildable — worst case one picture
        // uploads twice) and keep the parts that represent real user work.
        try {
            localStorage.setItem(LS_KEY, build(['npcReferences', 'perCharacterRefs', 'savedChars']));
            iigLog('WARN', 'localStorage backup trimmed: ' + e.message);
        } catch (e2) { iigLog('WARN', 'persistRefsToLocalStorage failed:', e2.message); }
    }
}

function restoreRefsFromLocalStorage() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return;
        const backup = JSON.parse(raw);
        if (!backup || typeof backup !== 'object') return;
        const settings = getSettings();
        // New shape carries both maps under named keys; anything older is the bare
        // npcReferences object this function used to write.
        if (backup.npcReferences || backup.perCharacterRefs) {
            if (backup.npcReferences) settings.npcReferences = backup.npcReferences;
            if (backup.perCharacterRefs && !Object.keys(settings.perCharacterRefs || {}).length) {
                settings.perCharacterRefs = backup.perCharacterRefs;
            }
        } else {
            settings.npcReferences = backup;
        }
        // The rest of the backup only fills gaps. A populated live value is always
        // newer than the copy, so overwriting it would undo real work.
        if (Array.isArray(backup.savedChars) && !(settings.savedChars || []).length) {
            settings.savedChars = backup.savedChars;
            iigLog('INFO', `Restored ${backup.savedChars.length} saved characters from localStorage`);
        }
        if (backup.refHashMap && !Object.keys(settings.refHashMap || {}).length) {
            settings.refHashMap = backup.refHashMap;
        }
        if (Array.isArray(backup.recentRefs) && !(settings.recentRefs || []).length) {
            settings.recentRefs = backup.recentRefs;
        }
        iigLog('INFO', 'Refs restored from localStorage');
    } catch (e) { iigLog('WARN', 'restoreRefsFromLocalStorage failed:', e.message); }
}

function initMobileSaveListeners() {
    const flush = () => {
        // persistRefsToLocalStorage is the only one of these that can still finish
        // on pagehide. The debounced save is scheduled a second out and the page is
        // usually gone by then — harmless to ask for, useless to rely on.
        persistRefsToLocalStorage();
        try { SillyTavern.getContext().saveSettingsDebounced(); } catch (e) { }
    };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
}

// ── NPC refs (per-character storage) ──
function getActiveCharacterName() {
    const ctx = SillyTavern.getContext();
    if (ctx.characterId !== undefined && ctx.characters?.[ctx.characterId]) {
        return ctx.characters[ctx.characterId].name || '';
    }
    return '';
}

function getActiveUserName() {
    const ctx = SillyTavern.getContext();
    return String(
        ctx.name1
        || ctx.user_name
        || ctx.chatMetadata?.user_name
        || ctx.groups?.find?.(g => g.id === ctx.groupId)?.name
        || ''
    ).trim();
}

function getDefaultCharRefName(refs = getCurrentCharacterRefs()) {
    return String(refs?.charRef?.name || getActiveCharacterName() || 'Character').trim();
}

function getDefaultUserRefName(refs = getCurrentCharacterRefs()) {
    return String(refs?.userRef?.name || getActiveUserName() || 'User').trim();
}

const EMPTY_REFS = () => ({
    charRef: { name: '', imageBase64: '', imagePath: '' },
    userRef: { name: '', imageBase64: '', imagePath: '' },
    npcReferences: [
        { name: '', imageBase64: '', imagePath: '' },
        { name: '', imageBase64: '', imagePath: '' },
        { name: '', imageBase64: '', imagePath: '' },
        { name: '', imageBase64: '', imagePath: '' },
    ],
});

function getCurrentCharacterRefs() {
    const settings = getSettings();
    const charName = getActiveCharacterName();

    // Initialize per-character storage if missing
    if (!settings.perCharacterRefs) settings.perCharacterRefs = {};

    // If we have a character selected, use per-character refs
    if (charName) {
        if (!settings.perCharacterRefs[charName]) {
            // Migrate: if old flat refs exist and this is the first time, copy them
            if (settings.charRef?.imagePath || settings.userRef?.imagePath || settings.npcReferences?.some?.(n => n?.imagePath || n?.imageBase64)) {
                settings.perCharacterRefs[charName] = {
                    charRef: settings.charRef ? { ...settings.charRef } : EMPTY_REFS().charRef,
                    userRef: settings.userRef ? { ...settings.userRef } : EMPTY_REFS().userRef,
                    npcReferences: Array.isArray(settings.npcReferences) ? settings.npcReferences.map(n => ({ ...n })) : EMPTY_REFS().npcReferences,
                };
                iigLog('INFO', `Migrated flat refs to per-character for "${charName}"`);
            } else {
                settings.perCharacterRefs[charName] = EMPTY_REFS();
            }
        }
        const refs = settings.perCharacterRefs[charName];
        if (!refs.charRef) refs.charRef = { name: '', imageBase64: '', imagePath: '' };
        if (!refs.userRef) refs.userRef = { name: '', imageBase64: '', imagePath: '' };
        if (!Array.isArray(refs.npcReferences)) refs.npcReferences = [];
        while (refs.npcReferences.length < 4) refs.npcReferences.push({ name: '', imageBase64: '', imagePath: '' });
        return refs;
    }

    // Fallback: no character selected — use flat refs
    if (!settings.charRef) settings.charRef = { name: '', imageBase64: '', imagePath: '' };
    if (!settings.userRef) settings.userRef = { name: '', imageBase64: '', imagePath: '' };
    if (!Array.isArray(settings.npcReferences)) settings.npcReferences = [];
    while (settings.npcReferences.length < 4) settings.npcReferences.push({ name: '', imageBase64: '', imagePath: '' });
    return settings;
}
function getCurrentCharacterNpcs() { return getCurrentCharacterRefs().npcReferences; }

// Parse a name field that may contain multiple aliases separated by comma / semicolon / pipe /
// slash / whitespace (e.g. "Ева, Eve, Eva, Ivy, Иви"). Returns tokens of length >= 2.
// The >=2 cutoff (was >2) lets 2-letter names like "Ли", "Ян", "Ed", "Jo" pass.
function parseNameTokens(rawName) {
    return String(rawName || '')
        .split(/[\s,;|/]+/)
        .map(t => t.trim())
        .filter(t => t.length >= 2);
}

// Generic placeholder names ST falls back to when persona/char name is empty.
// Without the skip below, nameIsInPrompt("User", "the user walks") returns
// true (substring match on "user") and our code happily ships the user ref
// into a prompt that has no actual user mention. Same for "Character", etc.
const NAME_GENERIC_FALLBACKS = new Set([
    'user', 'character', 'char', 'persona', 'юзер', 'персонаж', 'чар',
]);

// Substring check with Unicode-aware word boundary so a real-name alias
// doesn't trip on a longer word that just happens to contain it. Examples
// of the false positives this prevents:
//   Eva → evangelion / evangelist
//   Ева → евразия / евангелие
//   Roxy → proxy / epoxy
//   Ed → predator / editor
//   User → user-friendly (also caught by NAME_GENERIC_FALLBACKS above)
// Cyrillic letters are correctly treated as word chars via \p{L}.
function wordBoundaryIncludes(needle, haystack) {
    if (!needle || !haystack) return false;
    const isLetter = ch => !!ch && /[\p{L}]/u.test(ch);
    let idx = 0;
    while ((idx = haystack.indexOf(needle, idx)) !== -1) {
        const before = idx === 0 ? '' : haystack[idx - 1];
        const after = idx + needle.length >= haystack.length ? '' : haystack[idx + needle.length];
        if (!isLetter(before) && !isLetter(after)) return true;
        idx += 1;
    }
    return false;
}

function nameIsInPrompt(rawName, lowerPrompt) {
    const tokens = parseNameTokens(rawName);
    if (tokens.length === 0) return false;
    return tokens.some(token => {
        const lower = token.toLowerCase();
        if (NAME_GENERIC_FALLBACKS.has(lower)) return false;
        return wordBoundaryIncludes(lower, lowerPrompt);
    });
}

function matchNpcReferences(prompt, npcList) {
    if (!prompt || !npcList || npcList.length === 0) return [];
    const lowerPrompt = prompt.toLowerCase();
    const matched = [];
    for (const npc of npcList) {
        if (!npc || !npc.name || (!npc.imagePath && !npc.imageBase64 && !npc.imageData)) continue;
        if (nameIsInPrompt(npc.name, lowerPrompt)) {
            matched.push({ name: npc.name, imageBase64: npc.imageBase64, imagePath: npc.imagePath });
        }
    }
    return matched;
}

// ── External blocks + context images (from sillyimages-master) ──
function getMessageRenderText(message, settings = getSettings()) {
    if (!message) return '';
    if (settings.externalBlocks && message.extra?.display_text) return message.extra.display_text;
    return message.mes || '';
}

async function parseMessageImageTags(message, options = {}) {
    const settings = getSettings();
    const tags = [];
    const mainTags = await parseImageTags(message?.mes || '', options);
    tags.push(...mainTags.map(tag => ({ ...tag, sourceKey: 'mes' })));
    if (settings.externalBlocks && message?.extra?.extblocks) {
        const extTags = await parseImageTags(message.extra.extblocks, options);
        tags.push(...extTags.map(tag => ({ ...tag, sourceKey: 'extblocks' })));
    }
    return tags;
}

function replaceTagInMessageSource(message, tag, replacement) {
    if (!message || !tag) return;
    if (tag.sourceKey === 'extblocks') {
        if (!message.extra) message.extra = {};
        message.extra.extblocks = (message.extra.extblocks || '').replace(tag.fullMatch, replacement);
        const swipeId = message.swipe_id;
        if (swipeId !== undefined && message.swipe_info?.[swipeId]?.extra?.extblocks) {
            message.swipe_info[swipeId].extra.extblocks = message.swipe_info[swipeId].extra.extblocks.replace(tag.fullMatch, replacement);
        }
        if (message.extra.display_text) message.extra.display_text = message.extra.display_text.replace(tag.fullMatch, replacement);
        return;
    }
    // Main message path: update mes, display_text AND all swipes/swipe_info.
    // ST re-renders from swipes on chat reload AND on swipe-revert (after
    // an aborted swipe). Updating only the current swipe leaves stale src
    // in other swipe entries — abort/revert can resurrect them.
    message.mes = (message.mes || '').replace(tag.fullMatch, replacement);
    if (message.extra?.display_text) message.extra.display_text = message.extra.display_text.replace(tag.fullMatch, replacement);
    if (Array.isArray(message.swipes)) {
        for (let i = 0; i < message.swipes.length; i++) {
            if (typeof message.swipes[i] === 'string') {
                message.swipes[i] = message.swipes[i].replace(tag.fullMatch, replacement);
            }
        }
    }
    if (Array.isArray(message.swipe_info)) {
        for (let i = 0; i < message.swipe_info.length; i++) {
            const si = message.swipe_info[i]?.extra;
            if (!si) continue;
            if (typeof si.display_text === 'string') si.display_text = si.display_text.replace(tag.fullMatch, replacement);
            if (typeof si.extblocks === 'string') si.extblocks = si.extblocks.replace(tag.fullMatch, replacement);
        }
    }
}

function extractGeneratedImageUrlsFromText(text) {
    const urls = []; const seen = new Set(); const rawText = String(text || '');
    const legacyMatches = Array.from(rawText.matchAll(/\[IMG:✓:([^\]]+)\]/g));
    for (let i = legacyMatches.length - 1; i >= 0; i--) {
        const src = String(legacyMatches[i][1] || '').trim();
        if (!src || seen.has(src)) continue; seen.add(src); urls.push(src);
    }
    if (!rawText.includes('<img')) return urls;
    const template = document.createElement('template');
    template.innerHTML = rawText;
    const imageNodes = Array.from(template.content.querySelectorAll('img[data-iig-instruction], video[data-iig-instruction]')).reverse();
    for (const node of imageNodes) {
        const src = String(node.getAttribute('src') || '').trim();
        if (!src || src.startsWith('data:') || src.includes('[IMG:') || src.includes('[VID:') || src.endsWith('/error.svg') || seen.has(src)) continue;
        seen.add(src); urls.push(src);
    }
    return urls;
}

function getPreviousGeneratedImageUrls(messageId, requestedCount) {
    const count = normalizeImageContextCount(requestedCount);
    if (!Number.isInteger(messageId) || messageId <= 0) return [];
    const settings = getSettings();
    const context = SillyTavern.getContext();
    const chat = Array.isArray(context?.chat) ? context.chat : [];
    const urls = []; const seen = new Set();
    for (let idx = messageId - 1; idx >= 0 && urls.length < count; idx--) {
        const message = chat[idx];
        if (!message || message.is_user || message.is_system) continue;
        const text = getMessageRenderText(message, settings);
        const messageUrls = extractGeneratedImageUrlsFromText(text);
        for (const url of messageUrls) {
            if (seen.has(url)) continue; seen.add(url); urls.push(url);
            if (urls.length >= count) break;
        }
    }
    return urls;
}

// Per-message memo. A message with three image tags used to download the SAME
// context references three times over — once per tag — because every tag ran
// its own collection pass. Cleared when the message finishes processing.
const _contextRefCache = new Map();
function clearContextRefCache(messageId) {
    for (const k of _contextRefCache.keys()) if (k.startsWith(`${messageId}|`)) _contextRefCache.delete(k);
}

// Message ids restart from zero in every chat, so an entry left behind by one
// chat can be answered to a request from the next one — and the generation gets
// a picture the user never put there. Wipe the lot whenever the chat changes.
function clearAllContextRefCache() {
    if (_contextRefCache.size) iigLog('INFO', `Dropping ${_contextRefCache.size} cached context refs (chat changed)`);
    _contextRefCache.clear();
}

async function collectPreviousContextReferences(messageId, format, requestedCount) {
    const cacheKey = `${messageId}|${format}|${requestedCount}`;
    if (_contextRefCache.has(cacheKey)) return _contextRefCache.get(cacheKey);

    const urls = getPreviousGeneratedImageUrls(messageId, requestedCount);
    if (urls.length === 0) return [];
    const convert = format === 'dataUrl' ? imageUrlToDataUrl : imageUrlToBase64;
    const converted = await Promise.all(urls.map(url => convert(url)));

    // These were the only references sent at full size — every other ref path
    // already goes through compressBase64Image. A generated image is ~300-500KB
    // raw against ~40KB compressed, and they ride along on every request.
    const shrink = async (v) => {
        if (!v) return null;
        try {
            if (format === 'dataUrl') {
                const b64 = String(v).split(',')[1];
                if (!b64) return v;
                return 'data:image/jpeg;base64,' + await compressBase64Image(b64, 768, 0.8);
            }
            return await compressBase64Image(v, 768, 0.8);
        } catch (e) { iigLog('WARN', 'context ref compression failed, sending as-is:', e?.message); return v; }
    };
    const out = (await Promise.all(converted.filter(Boolean).map(shrink))).filter(Boolean);

    _contextRefCache.set(cacheKey, out);
    return out;
}

// ── Image utilities ──
// Fallback compressor, reached when computeRefHashes could not decode the picture
// on its own. It used to be able to hang forever: the body of onload had no
// try/catch, there was no timeout, and iOS Safari gives up on images past roughly
// 16 megapixels WITHOUT firing either load or error. The promise then never
// settled and the await upstream waited for the rest of the session — no toast, no
// placeholder, nothing at all. From the outside it looked like the upload button
// simply did nothing, which is exactly what the iPhone reports described.
//
// It also announced every picture as image/jpeg regardless of what it really was;
// PNG and WebP survived only because browsers sniff the bytes anyway.
const COMPRESS_TIMEOUT_MS = 20000;

function compressBase64Image(rawBase64, maxDim = 768, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        let settled = false;
        const done = (fn, arg) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try { img.src = ''; } catch (_) {}   // let the decoded bitmap go
            fn(arg);
        };
        const timer = setTimeout(
            () => done(reject, new Error('Картинка слишком большая — устройство не смогло её открыть')),
            COMPRESS_TIMEOUT_MS);

        img.onload = () => {
            try {
                let w = img.width, h = img.height;
                if (!w || !h) throw new Error('нулевой размер');
                if (w > maxDim || h > maxDim) { const scale = maxDim / Math.max(w, h); w = Math.round(w * scale); h = Math.round(h * scale); }
                const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                const b64 = canvas.toDataURL('image/jpeg', quality).split(',')[1];
                canvas.width = canvas.height = 0;
                iigLog('INFO', `Compressed: ${img.width}x${img.height} -> ${w}x${h}, ~${Math.round(b64.length / 1024)}KB`);
                done(resolve, b64);
            } catch (e) {
                done(reject, new Error('Не удалось уменьшить картинку: ' + (e?.message || e)));
            }
        };
        img.onerror = () => done(reject, new Error('Не удалось открыть картинку — возможно, формат не поддерживается'));
        img.src = `data:${detectImageMimeFromBase64(rawBase64)};base64,${rawBase64}`;
    });
}

async function fetchImageBlob(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) { iigLog('WARN', `Skipping ref fetch: url=${url} status=${response.status}`); return null; }
        const contentType = String(response.headers.get('content-type') || '').toLowerCase();
        if (!contentType.startsWith('image/')) { iigLog('WARN', `Non-image content-type: url=${url} ct=${contentType}`); return null; }
        const blob = await response.blob();
        const blobType = String(blob.type || contentType || '').toLowerCase();
        if (!blobType.startsWith('image/')) { iigLog('WARN', `Non-image blob type: url=${url} bt=${blobType}`); return null; }
        return blob;
    } catch (error) { iigLog('WARN', `Ref fetch failed: url=${url} err=${error?.message}`); return null; }
}

async function imageUrlToBase64(url) {
    try {
        const blob = await fetchImageBlob(url);
        if (!blob) return null;
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) { console.error('[IIG] imageUrlToBase64 failed:', error); return null; }
}

async function imageUrlToDataUrl(url) {
    try {
        const blob = await fetchImageBlob(url);
        if (!blob) return null;
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) { console.error('[IIG] imageUrlToDataUrl failed:', error); return null; }
}

// ── v4.2 Recent Refs ──
// Tracks the last N ref-image paths that were assigned to any slot, so the user can
// re-assign them quickly via a ribbon under the refs block or a "Недавние" picker.
const RECENT_REFS_MAX = 10;

function pushRecentRef(path) {
    if (!path) return;
    const settings = getSettings();
    if (!Array.isArray(settings.recentRefs)) settings.recentRefs = [];
    // Remove any existing entry with this path (we'll re-insert at front)
    settings.recentRefs = settings.recentRefs.filter(r => (typeof r === 'string' ? r : r.path) !== path);
    settings.recentRefs.unshift({ path, lastUsed: Date.now() });
    if (settings.recentRefs.length > RECENT_REFS_MAX) settings.recentRefs.length = RECENT_REFS_MAX;
    saveSettings();
    // Re-render ribbon if UI is mounted
    try { renderRecentRefsRibbon(); } catch (_) { /* no-op if not yet mounted */ }
}

function getRecentRefs() {
    const settings = getSettings();
    const list = Array.isArray(settings.recentRefs) ? settings.recentRefs : [];
    return list.map(r => typeof r === 'string' ? { path: r, lastUsed: 0 } : r).filter(r => r.path);
}

function removeRecentRef(path) {
    const settings = getSettings();
    if (!Array.isArray(settings.recentRefs)) return;
    settings.recentRefs = settings.recentRefs.filter(r => (typeof r === 'string' ? r : r.path) !== path);
    saveSettings();
    try { renderRecentRefsRibbon(); } catch (_) {}
}

// ── Библиотека сохранённых персонажей ──
// Recent refs are a rolling window of 10 paths with no names — good for "the
// picture I used a minute ago", useless for "Ева, the one I use in every chat".
// This is the permanent half: a named entry keeps BOTH the portrait and the
// comma-separated name list, so re-using a character in a new chat is one tap
// instead of hunting for the file and retyping the names.
// Global on purpose — the whole point is that it survives switching characters.
// A CHARACTER owns the names; a LOOK owns a picture and its label.
//   savedChars: [{ id, names, looks: [{ id, label, path, addedAt }] }]
// The old shape stored one flat entry per picture, so the same person in four
// AUs meant four cards with "Ден, Денис, Денчик" retyped into each. Names now
// live once per character and pictures hang off them — which is also what the
// prompt matcher wants, since it has only ever cared about the name list.
const swUid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function getSavedChars() {
    const settings = getSettings();
    if (!Array.isArray(settings.savedChars)) settings.savedChars = [];
    migrateSavedPortraits(settings);
    // Drop empties defensively — a character with no pictures has nothing to show.
    return settings.savedChars.filter(c => c && Array.isArray(c.looks) && c.looks.length);
}

// One-way lift of the old flat list. Entries group by ANY shared name rather
// than an identical list: "Dana" and "Dana, Дана" are one person, and matching
// the whole string filed them as two. This is the rule the ref matcher already
// uses against a prompt, so the library agrees with what generation does.
// Each old `note` becomes its look's label — what the note always meant anyway.
function migrateSavedPortraits(settings) {
    const old = settings.savedPortraits;
    if (!Array.isArray(old) || !old.length) return;
    for (const p of old) {
        if (!p || !p.path) continue;
        const mine = swNameList(p.name || '').map(x => x.toLowerCase());
        let ch = mine.length
            ? settings.savedChars.find(c => swNameList(c.names).some(n => mine.includes(n.toLowerCase())))
            : null;
        if (!ch) {
            ch = { id: swUid('sc'), names: p.name || '', looks: [] };
            settings.savedChars.push(ch);
        } else {
            // Union the names so the merged character still answers to both halves.
            const have = new Set(swNameList(ch.names).map(x => x.toLowerCase()));
            const extra = swNameList(p.name || '').filter(n => !have.has(n.toLowerCase()));
            if (extra.length) ch.names = [...swNameList(ch.names), ...extra].join(', ');
        }
        if (!ch.looks.some(l => l.path === p.path)) {
            ch.looks.push({ id: swUid('sl'), label: p.note || '', path: p.path, addedAt: p.addedAt || Date.now() });
        }
    }
    delete settings.savedPortraits;
    iigLog('INFO', `savedPortraits -> savedChars: ${old.length} -> ${settings.savedChars.length}`);
    saveSettings();
}

// Fold one saved character into another: looks move over, names merge, source
// disappears. The library can hold the same person twice — from the old flat
// data or from a typo — and until now there was no way back out.
function mergeSavedChars(fromId, intoId) {
    const settings = getSettings();
    const list = settings.savedChars || [];
    const from = list.find(c => c.id === fromId);
    const into = list.find(c => c.id === intoId);
    if (!from || !into || from === into) return false;
    for (const l of from.looks) if (!into.looks.some(x => x.path === l.path)) into.looks.push(l);
    const have = new Set(swNameList(into.names).map(x => x.toLowerCase()));
    const extra = swNameList(from.names).filter(n => !have.has(n.toLowerCase()));
    if (extra.length) into.names = [...swNameList(into.names), ...extra].join(', ');
    settings.savedChars = list.filter(c => c.id !== fromId);
    saveSettings();
    try { renderSavedPortraits(); } catch (_) {}
    return true;
}

const swNameList = (s) => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
const normalizeNameKey = (s) => swNameList(s).map(x => x.toLowerCase()).sort().join('|');

// Which saved character do these typed names belong to? Any single shared name
// is enough — exactly the rule the ref matcher uses against a prompt, so what
// the user sees here matches what actually happens during generation.
function findSavedCharByNames(typed) {
    const want = new Set(swNameList(typed).map(x => x.toLowerCase()));
    if (!want.size) return null;
    return getSavedChars().find(c => swNameList(c.names).some(n => want.has(n.toLowerCase()))) || null;
}

function findSavedCharByPath(path) {
    if (!path) return null;
    for (const c of getSavedChars()) if (c.looks.some(l => l.path === path)) return c;
    return null;
}

// Add a look to an existing character, or create the character and start it off
// with this one. Re-saving a picture that is already there just relabels it.
function saveLook({ charId = null, names = '', label = '', path }) {
    if (!path) return null;
    const settings = getSettings();
    if (!Array.isArray(settings.savedChars)) settings.savedChars = [];

    let ch = charId ? settings.savedChars.find(c => c.id === charId) : null;
    if (!ch) {
        ch = { id: swUid('sc'), names: names || '', looks: [] };
        settings.savedChars.unshift(ch);
    } else if (names) {
        ch.names = names;
    }

    const dupe = ch.looks.find(l => l.path === path);
    if (dupe) { if (label) dupe.label = label; dupe.addedAt = Date.now(); }
    else ch.looks.push({ id: swUid('sl'), label: label || '', path, addedAt: Date.now() });

    saveSettings();
    try { renderSavedPortraits(); } catch (_) {}
    return ch;
}

// Everywhere a stored picture can be referenced from. Used before deleting a
// file: the same path is routinely shared between a look, a wardrobe item and a
// ref slot in some other chat, and removing it from under them is exactly the
// quiet damage this extension has been apologising for all week.
// 1 место, 2 места, 5 мест — и глагол тоже меняется. С оглядкой на 11-14, где
// правило ломается: одиннадцать МЕСТ, а не одиннадцать место.
function slayPlural(n, one, few, many) {
    const a = Math.abs(n) % 100;
    if (a >= 11 && a <= 14) return many;
    const b = a % 10;
    if (b === 1) return one;
    if (b >= 2 && b <= 4) return few;
    return many;
}

function slayCountPathUses(path) {
    if (!path) return 0;
    let n = 0;
    try {
        const all = SillyTavern.getContext().extensionSettings || {};
        for (const [key, val] of Object.entries(all)) {
            if (!val || typeof val !== 'object') continue;
            // Saved characters and their looks
            if (Array.isArray(val.savedChars)) {
                for (const c of val.savedChars) for (const l of (c.looks || [])) if (l.path === path) n++;
            }
            // Wardrobe items, in this build and any other
            if (key.startsWith('slay_wardrobe') && Array.isArray(val.items)) {
                for (const it of val.items) if (it && it.imagePath === path) n++;
            }
            // Ref slots, per character
            const pcr = val.perCharacterRefs;
            if (pcr && typeof pcr === 'object') {
                for (const refs of Object.values(pcr)) {
                    if (!refs) continue;
                    if (refs.charRef && refs.charRef.imagePath === path) n++;
                    if (refs.userRef && refs.userRef.imagePath === path) n++;
                    for (const npc of (refs.npcReferences || [])) if (npc && npc.imagePath === path) n++;
                }
            }
            if (val.charRef && val.charRef.imagePath === path) n++;
            if (val.userRef && val.userRef.imagePath === path) n++;
            for (const npc of (val.npcReferences || [])) if (npc && npc.imagePath === path) n++;
            // Recently-used ribbon
            for (const r of (val.recentRefs || [])) {
                const p = typeof r === 'string' ? r : (r && r.path);
                if (p === path) n++;
            }
        }
    } catch (e) { iigLog('WARN', 'slayCountPathUses failed:', e?.message); return 99; }
    return n;
}

// Delete a stored picture from disk. Refuses if anything still points at it.
async function slayDeleteStoredImage(path) {
    try {
        if (!path || !path.startsWith('/user/images/')) return false;
        const uses = slayCountPathUses(path);
        if (uses > 0) { iigLog('INFO', `not deleting ${path} — still used ${uses}×`); return false; }
        const r = await fetch('/api/images/delete', {
            method: 'POST', headers: SillyTavern.getContext().getRequestHeaders(),
            body: JSON.stringify({ path: path.replace(/^\//, '') })
        });
        if (r.ok) { iigLog('INFO', `deleted ${path}`); return true; }
        iigLog('WARN', `delete failed (${r.status}) for ${path}`);
        return false;
    } catch (e) { iigLog('WARN', 'slayDeleteStoredImage failed:', e?.message); return false; }
}

function removeSavedLook(charId, lookId) {
    const settings = getSettings();
    const ch = (settings.savedChars || []).find(c => c.id === charId);
    if (!ch) return;
    ch.looks = ch.looks.filter(l => l.id !== lookId);
    // Last picture gone means the character has nothing left to be.
    if (!ch.looks.length) settings.savedChars = settings.savedChars.filter(c => c.id !== charId);
    saveSettings();
    try { renderSavedPortraits(); } catch (_) {}
}

function renameSavedChar(charId, names) {
    const ch = (getSettings().savedChars || []).find(c => c.id === charId);
    if (!ch || names === undefined) return;
    ch.names = names;
    saveSettings();
    try { renderSavedPortraits(); } catch (_) {}
}

function relabelSavedLook(charId, lookId, label) {
    const ch = (getSettings().savedChars || []).find(c => c.id === charId);
    const lk = ch?.looks.find(l => l.id === lookId);
    if (!lk || label === undefined) return;
    lk.label = label;
    saveSettings();
    try { renderSavedPortraits(); } catch (_) {}
}

// Detect image MIME type from base64 prefix (first few characters after base64-encoding the magic bytes)
function detectImageMimeFromBase64(base64) {
    if (!base64) return 'image/jpeg';
    if (base64.startsWith('/9j/')) return 'image/jpeg';
    if (base64.startsWith('iVBORw')) return 'image/png';
    if (base64.startsWith('R0lG')) return 'image/gif';
    if (base64.startsWith('UklGR')) return 'image/webp';
    return 'image/jpeg';
}

// Compute SHA-256 hex digest of base64-encoded BYTES (identical for byte-identical files only).
async function sha256OfBase64(base64) {
    try {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) { iigLog('WARN', `sha256 failed: ${e?.message}`); return null; }
}

// Compute SHA-256 digest of DECODED pixel data after downscaling to 32x32 grayscale-ish.
// Catches the "same image re-encoded as different JPEG" case (Telegram/browser recompression
// changes bytes but the visual content decodes to ~identical pixels).
// Returns null on failure (non-image data, CORS, etc.) — caller should fall back to byte-hash.
async function pixelHashOfBase64(base64) {
    try {
        const mime = detectImageMimeFromBase64(base64);
        const img = new Image();
        img.decoding = 'sync';
        img.src = `data:${mime};base64,${base64}`;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = 32; canvas.height = 32;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 32, 32);
        const { data } = ctx.getImageData(0, 0, 32, 32); // Uint8ClampedArray, 32*32*4 bytes
        // Quantize each channel to 4 bits to absorb tiny JPEG encoding noise — two visually
        // identical images re-encoded with different quality will still round to the same hash.
        const quantized = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) quantized[i] = data[i] & 0xF0;
        const digest = await crypto.subtle.digest('SHA-256', quantized);
        return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) { iigLog('WARN', `pixelHash failed: ${e?.message}`); return null; }
}

// Compute BOTH hashes — byte (exact) and pixel (visual) — AND the compressed
// copy, from a SINGLE decode. Callers used to run computeRefHashes and then
// compressBase64Image, each decoding the original file at full resolution: a
// 12 MP phone photo is ~48 MB as a bitmap, so two of them plus the base64
// string regularly killed the tab on mid-range devices during a ref upload.
// The pixel hash is still taken from the same full-resolution source drawn to
// 32×32, so values are byte-identical to before and existing dedup entries
// keep matching. Returns { byteHash, pixelHash, compressed }.
async function computeRefHashes(rawBase64, { compress = true, maxDim = 768, quality = 0.8 } = {}) {
    const byteHashP = sha256OfBase64(rawBase64);
    let pixelHash = null, compressed = null;
    try {
        const mime = detectImageMimeFromBase64(rawBase64);
        const img = new Image();
        img.decoding = 'sync';
        img.src = `data:${mime};base64,${rawBase64}`;
        await img.decode();

        // Pixel hash: 32×32, channels quantized to 4 bits so the same picture
        // re-encoded at a different quality still lands on the same hash.
        try {
            const c = document.createElement('canvas');
            c.width = 32; c.height = 32;
            const cx = c.getContext('2d', { willReadFrequently: true });
            cx.drawImage(img, 0, 0, 32, 32);
            const { data } = cx.getImageData(0, 0, 32, 32);
            const quantized = new Uint8Array(data.length);
            for (let i = 0; i < data.length; i++) quantized[i] = data[i] & 0xF0;
            const digest = await crypto.subtle.digest('SHA-256', quantized);
            pixelHash = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) { iigLog('WARN', `pixelHash failed: ${e?.message}`); }

        if (compress) {
            let w = img.width, h = img.height;
            if (w > maxDim || h > maxDim) { const scale = maxDim / Math.max(w, h); w = Math.round(w * scale); h = Math.round(h * scale); }
            const c2 = document.createElement('canvas');
            c2.width = w; c2.height = h;
            c2.getContext('2d').drawImage(img, 0, 0, w, h);
            compressed = c2.toDataURL('image/jpeg', quality).split(',')[1];
            iigLog('INFO', `Compressed: ${img.width}x${img.height} -> ${w}x${h}, ~${Math.round(compressed.length / 1024)}KB (single decode)`);
        }
        img.src = '';   // let the decoded bitmap go before the next await
    } catch (e) { iigLog('WARN', `decode for hashing/compression failed: ${e?.message}`); }
    return { byteHash: await byteHashP, pixelHash, compressed };
}

// Quick HEAD probe to check if a previously-saved path still exists on disk.
// If the user deleted it from /user/images manually, we shouldn't return a stale path.
async function refFileStillExists(path) {
    try {
        const r = await fetch(path, { method: 'HEAD' });
        // Only a real "gone" counts. Any other outcome — a dropped request, a
        // busy server, a suspended tab — used to read as "file missing", which
        // made the caller DELETE the dedup entry; re-adding that picture then
        // wrote a second identical file into iig_refs.
        if (r.status === 404 || r.status === 410) return false;
        return true;
    } catch (_) {
        iigLog('WARN', `refFileStillExists: check failed for ${String(path).slice(-40)} — keeping the dedup entry`);
        return true;
    }
}

// Lookup existing path by hash. Returns path string or null.
// Used by file upload AND paste handlers — they hash BEFORE compression, to avoid the
// non-deterministic canvas.toDataURL re-encode producing a different hash on the same image.
// Lookup a path by ANY of the provided hashes (byte or pixel). Returns path or null.
async function lookupRefByHashes(hashes) {
    if (!hashes || (!hashes.byteHash && !hashes.pixelHash)) {
        iigLog('WARN', 'lookupRefByHashes: no hashes provided');
        return null;
    }
    const settings = (typeof getSettings === 'function') ? getSettings() : (SillyTavern.getContext().extensionSettings[MODULE_NAME] || {});
    if (!settings.refHashMap || typeof settings.refHashMap !== 'object') {
        iigLog('INFO', `Ref dedup miss: refHashMap empty (b:${hashes.byteHash?.slice(0,8)} p:${hashes.pixelHash?.slice(0,8)})`);
        return null;
    }
    const mapSize = Object.keys(settings.refHashMap).length;
    // Try pixel-hash FIRST — it's the visual match that catches JPEG recompression
    const candidates = [
        { kind: 'pixel', hash: hashes.pixelHash },
        { kind: 'byte',  hash: hashes.byteHash },
    ];
    for (const c of candidates) {
        if (!c.hash) continue;
        const entry = settings.refHashMap[c.hash];
        const existingPath = typeof entry === 'string' ? entry : entry?.path;
        if (!existingPath) continue;
        if (!(await refFileStillExists(existingPath))) {
            iigLog('INFO', `Ref dedup stale ${c.kind}: ${existingPath} gone, removing entry`);
            delete settings.refHashMap[c.hash];
            continue;
        }
        settings.refHashMap[c.hash] = { path: existingPath, lastUsed: Date.now() };
        if (typeof saveSettings === 'function') saveSettings();
        iigLog('INFO', `Ref dedup HIT (${c.kind}): reusing ${existingPath} (hash ${c.hash.slice(0, 8)}…, map ${mapSize})`);
        return existingPath;
    }
    iigLog('INFO', `Ref dedup miss: neither byte ${hashes.byteHash?.slice(0,8)}… nor pixel ${hashes.pixelHash?.slice(0,8)}… matched (map ${mapSize})`);
    return null;
}

function recordRefHashes(hashes, path) {
    if (!path) return;
    if (!hashes?.byteHash && !hashes?.pixelHash) return;
    const settings = (typeof getSettings === 'function') ? getSettings() : (SillyTavern.getContext().extensionSettings[MODULE_NAME] || {});
    if (!settings.refHashMap || typeof settings.refHashMap !== 'object') settings.refHashMap = {};
    const ts = Date.now();
    if (hashes.byteHash) settings.refHashMap[hashes.byteHash] = { path, lastUsed: ts };
    if (hashes.pixelHash) settings.refHashMap[hashes.pixelHash] = { path, lastUsed: ts };
    // Cap at 1000 entries (each ref can add 2), drop oldest
    const entries = Object.entries(settings.refHashMap);
    if (entries.length > 1000) {
        entries.sort((a, b) => (a[1].lastUsed || 0) - (b[1].lastUsed || 0));
        for (const [h] of entries.slice(0, entries.length - 1000)) delete settings.refHashMap[h];
    }
    if (typeof saveSettings === 'function') saveSettings();
    iigLog('INFO', `Recording ref hashes (b:${hashes.byteHash?.slice(0,8)} p:${hashes.pixelHash?.slice(0,8)}) -> ${path} (map ${Object.keys(settings.refHashMap).length})`);
}

// Legacy single-hash lookup — still used elsewhere, thin wrapper for compat.
async function lookupRefByHash(hash) { return lookupRefByHashes({ byteHash: hash }); }

// Is this picked file one we wrote ourselves? The browser never reveals which
// folder a file came from, but our own uploads are named `iig_ref_<label>_<ts>`,
// so a matching name plus a matching size on disk is conclusive enough to skip
// the upload entirely and just point at what is already there.
//
// Content hashing only recognises files saved AFTER we started recording the
// hash of the written bytes — every ref from before that (hundreds, in a
// long-running install) still hashed differently from its own stored copy and
// got duplicated on every re-pick. Matching the filename covers all of them.
async function resolveExistingRefByFileName(file) {
    try {
        const name = String(file && file.name || '');
        if (!/^iig_ref_.+\.(jpe?g|png|webp)$/i.test(name)) return null;
        const path = `/user/images/iig_refs/${encodeURIComponent(name)}`;
        const r = await fetch(path, { method: 'HEAD' });
        if (!r.ok) return null;
        // Same name AND same byte count — a rename collision would have to be
        // deliberate to get past both.
        const len = Number(r.headers.get('content-length') || 0);
        if (len && file.size && len !== file.size) {
            iigLog('INFO', `ref by name: "${name}" exists but size differs (${len} vs ${file.size}) — treating as new`);
            return null;
        }
        iigLog('INFO', `ref by name: reusing ${path}, no copy written`);
        return `/user/images/iig_refs/${name}`;
    } catch (e) { return null; }
}

async function saveRefImageToFile(base64Data, label, opts = {}) {
    const context = SillyTavern.getContext();
    // If caller provided a pre-computed hash (from raw/uncompressed bytes), honour it for dedup record.
    // Otherwise compute from the (possibly compressed) bytes we're about to upload.
    const hash = opts.hash || await sha256OfBase64(base64Data);

    // If dedup check wasn't done by caller, try it now — but this only dedupes the compressed payload,
    // which is less reliable than hashing raw bytes (canvas re-encode can differ).
    if (!opts.skipDedupCheck) {
        const cached = await lookupRefByHash(hash);
        if (cached) return cached;
    }

    const safeName = label.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
    const filename = `iig_ref_${safeName}_${Date.now()}`;
    const response = await fetch('/api/images/upload', {
        method: 'POST', headers: context.getRequestHeaders(),
        body: JSON.stringify({ image: base64Data, format: 'jpeg', ch_name: 'iig_refs', filename })
    });
    if (!response.ok) { const err = await response.json().catch(() => ({ error: 'Unknown' })); throw new Error(err.error || `Upload failed: ${response.status}`); }
    const result = await response.json();
    iigLog('INFO', `Ref saved: ${result.path}`);
    // Callers record hashes of the RAW file they were handed. But what lands on
    // disk is the COMPRESSED re-encode, whose bytes hash differently — so the
    // moment a user re-adds a picture that came out of iig_refs (a re-download,
    // a copy, the same file picked twice through different routes) nothing
    // matched and we wrote yet another identical jpeg. Record the hashes of what
    // we actually stored as well, so the stored file recognises itself later.
    try {
        const own = await computeRefHashes(base64Data, { compress: false });
        recordRefHashes(own, result.path);
    } catch (e) { iigLog('WARN', 'self-hash after save failed:', e?.message); }
    return result.path;
}

async function loadRefImageAsBase64(path) {
    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) { iigLog('WARN', `loadRefImageAsBase64 failed for ${path}:`, e.message); return null; }
}

// (Removed in 4.2.4: getCharacterAvatarBase64 / getUserAvatarBase64 / their
// DataUrl variants. Used to be the silent fallback when ref slots were empty
// — that "feature" surprised users into seeing refs sent when they thought
// everything was off. Now: empty slot = nothing sent. If the user wants their
// character avatar as a ref, they upload it manually into the char slot.)

function hasManualReference(ref) {
    return Boolean(ref?.imagePath || ref?.imageBase64 || ref?.imageData);
}

// Empty slot = no ref. Used to silently fall back to ST character/user avatar
// which violated the "empty slot means nothing is sent" expectation. Now strict:
// slot needs an actual uploaded image (imagePath/imageBase64/imageData). If
// empty → return null, even when char/user is named in the prompt.
async function getPreferredCharacterReferenceBase64(refs, settings) {
    if (!settings.sendCharAvatar) return null;
    if (!hasManualReference(refs?.charRef)) return null;
    return refs.charRef.imagePath
        ? await loadRefImageAsBase64(refs.charRef.imagePath)
        : (refs.charRef.imageBase64 || refs.charRef.imageData || null);
}

async function getPreferredUserReferenceBase64(refs, settings) {
    if (!settings.sendUserAvatar) return null;
    if (!hasManualReference(refs?.userRef)) return null;
    return refs.userRef.imagePath
        ? await loadRefImageAsBase64(refs.userRef.imagePath)
        : (refs.userRef.imageBase64 || refs.userRef.imageData || null);
}

async function getPreferredCharacterReferenceDataUrl(refs, settings) {
    if (!settings.sendCharAvatar) return null;
    if (!hasManualReference(refs?.charRef)) return null;
    const manual = refs.charRef.imagePath
        ? await loadRefImageAsBase64(refs.charRef.imagePath)
        : (refs.charRef.imageBase64 || refs.charRef.imageData || null);
    return manual ? `data:image/jpeg;base64,${manual}` : null;
}

async function getPreferredUserReferenceDataUrl(refs, settings) {
    if (!settings.sendUserAvatar) return null;
    if (!hasManualReference(refs?.userRef)) return null;
    const manual = refs.userRef.imagePath
        ? await loadRefImageAsBase64(refs.userRef.imagePath)
        : (refs.userRef.imageBase64 || refs.userRef.imageData || null);
    return manual ? `data:image/jpeg;base64,${manual}` : null;
}

async function fetchUserAvatars() {
    try {
        const context = SillyTavern.getContext();
        const response = await fetch('/api/avatars/get', { method: 'POST', headers: context.getRequestHeaders() });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) { console.error('[IIG] fetchUserAvatars failed:', error); return []; }
}

// Normalize an API endpoint to its BASE url: trim, drop trailing slash(es),
// drop trailing /v1 or /v1beta. Users routinely paste endpoints from provider
// docs WITH the version segment (https://ellyai.pro/v1, https://openrouter.ai/api/v1)
// — our code then appends /v1/chat/completions and lands on /v1/v1/... →
// 404/405 without CORS headers → browser shows "Failed to fetch".
function normalizeApiEndpoint(raw) {
    if (!raw) return '';
    return String(raw).trim()
        .replace(/\/+$/, '')
        .replace(/\/v1(beta)?$/i, '')
        .replace(/\/+$/, '');
}

// Strip invisible unicode + whitespace that riders in from clipboard (Telegram
// loves zero-width spaces). HTTP headers are ISO-8859-1 only — one stray
// cyrillic letter or U+200B in the key makes fetch throw a cryptic
// "String contains non ISO-8859-1 code point" before the request even leaves.
function sanitizeApiKey(raw) {
    return String(raw || '').replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '').trim();
}

// Build Authorization headers, failing EARLY with a human-readable error if
// the key still contains non-ASCII garbage after sanitization.
function buildAuthHeaders(apiKey, extra = {}) {
    const key = sanitizeApiKey(apiKey);
    if (!key) throw new Error('API Key не задан');
    if (!/^[\x20-\x7E]+$/.test(key)) {
        throw new Error('API Key содержит недопустимые символы (кириллица или невидимый юникод из буфера обмена). Очистите поле и вставьте ключ заново.');
    }
    return { 'Authorization': `Bearer ${key}`, ...extra };
}

async function fetchModels() {
    const settings = getSettings();
    // Custom = full URL straight to a generation endpoint; appending /v1/models
    // to it is meaningless. Model (if needed) is typed by hand.
    if (settings.apiType === 'custom') {
        toastr.info('Custom URL: списка моделей нет, введи имя модели вручную (или оставь пустым)', 'SLAY Images', { timeOut: 3500 });
        return [];
    }
    const endpoint = settings.endpoint ? normalizeApiEndpoint(settings.endpoint) : getEffectiveEndpoint(settings);
    if (!endpoint || !settings.apiKey) {
        console.warn('[IIG] Cannot fetch models: endpoint=' + endpoint + ' apiKey=' + (settings.apiKey ? 'set' : 'empty'));
        toastr.warning('Укажите endpoint и API key', 'SLAY Images');
        return [];
    }
    const url = `${endpoint}/v1/models`;
    try {
        const response = await fetch(url, { method: 'GET', headers: buildAuthHeaders(settings.apiKey) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const all = (data.data || []).map(m => m.id).filter(Boolean);
        // DON'T hard-filter by isImageModel() — the keyword whitelist drops
        // legit models the user needs (recraft, custom proxy aliases, anything
        // new). Instead surface ALL models with the likely-image ones sorted
        // first so they're easy to pick, and the rest still available below.
        const imageLikely = [];
        const rest = [];
        for (const id of all) (isImageModel(id) ? imageLikely : rest).push(id);
        imageLikely.sort(); rest.sort();
        return [...imageLikely, ...rest];
    } catch (error) { console.error('[IIG] fetchModels failed:', error); toastr.error(`Ошибка загрузки моделей: ${error.message}`, 'SLAY Images'); return []; }
}

// ── Save image/video to file ──
const IIG_UPLOAD_FORMAT_MAP = Object.freeze({ 'jpeg': 'jpg', 'jpg': 'jpg', 'pjpeg': 'jpg', 'jfif': 'jpg', 'png': 'png', 'x-png': 'png', 'webp': 'webp', 'gif': 'gif' });
const IIG_UPLOAD_ALLOWED_FORMATS = new Set(['jpg', 'png', 'webp', 'gif']);

function parseImageDataUrl(dataUrl) {
    if (typeof dataUrl !== 'string') throw new Error(`Invalid data URL type: ${typeof dataUrl}`);
    if (!dataUrl.startsWith('data:')) throw new Error('Invalid data URL prefix');
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx <= 5) throw new Error('Invalid data URL format (missing comma)');
    const meta = dataUrl.slice(5, commaIdx).trim();
    const base64Data = dataUrl.slice(commaIdx + 1).trim();
    const metaParts = meta.split(';').map(s => s.trim()).filter(Boolean);
    const mimeType = (metaParts[0] || '').toLowerCase();
    const hasBase64 = metaParts.some(p => p.toLowerCase() === 'base64');
    if (!mimeType.startsWith('image/')) throw new Error(`Invalid mime type: ${mimeType}`);
    if (!hasBase64) throw new Error('base64 flag missing');
    if (!base64Data) throw new Error('empty base64');
    const subtype = mimeType.slice('image/'.length).toLowerCase();
    const normalizedFormat = IIG_UPLOAD_FORMAT_MAP[subtype] || subtype;
    return { mimeType, subtype, normalizedFormat, base64Data };
}

async function convertDataUrlToPng(dataUrl) {
    return await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
            if (!w || !h) { reject(new Error('Image decode failed')); return; }
            const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) { reject(new Error('Canvas 2D unavailable')); return; }
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => reject(new Error('Failed to decode data URL'));
        img.src = dataUrl;
    });
}

async function saveImageToFile(dataUrl, debugMeta = {}) {
    const context = SillyTavern.getContext();
    let parsed;
    try { parsed = parseImageDataUrl(dataUrl); } catch (error) {
        iigLog('ERROR', `saveImageToFile parse failed: ${error.message}; prefix=${String(dataUrl).slice(0, 120)}`);
        throw error;
    }
    if (!IIG_UPLOAD_ALLOWED_FORMATS.has(parsed.normalizedFormat)) {
        iigLog('WARN', `Unsupported format "${parsed.subtype}", converting to PNG`);
        const converted = await convertDataUrlToPng(dataUrl);
        parsed = parseImageDataUrl(converted);
    }
    let charName = 'generated';
    if (context.characterId !== undefined && context.characters?.[context.characterId]) charName = context.characters[context.characterId].name || 'generated';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const response = await fetch('/api/images/upload', {
        method: 'POST', headers: context.getRequestHeaders(),
        body: JSON.stringify({ image: parsed.base64Data, format: parsed.normalizedFormat, ch_name: charName, filename: `iig_${timestamp}` })
    });
    if (!response.ok) {
        const raw = await response.text().catch(() => '');
        let pe = {}; try { pe = raw ? JSON.parse(raw) : {}; } catch (_) { }
        throw new Error(pe?.error || pe?.detail || raw || `Upload failed: ${response.status}`);
    }
    const result = await response.json();
    iigLog('INFO', 'Image saved to:', result.path);
    return result.path;
}

async function saveNaisteraMediaToFile(dataUrl, mediaKind = 'video', debugMeta = {}) {
    if (mediaKind !== 'video') throw new Error(`Unsupported mediaKind: ${mediaKind}`);
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:video/mp4;base64,')) throw new Error('Only data:video/mp4;base64 supported');
    const context = SillyTavern.getContext();
    const base64Data = dataUrl.slice('data:video/mp4;base64,'.length).trim();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const response = await fetch('/api/files/upload', {
        method: 'POST', headers: context.getRequestHeaders(),
        body: JSON.stringify({ name: `iig_video_${timestamp}.mp4`, data: base64Data })
    });
    if (!response.ok) { const raw = await response.text().catch(() => ''); throw new Error(raw || `Media upload failed: ${response.status}`); }
    const result = await response.json();
    if (!result?.path) throw new Error('No path in media upload response');
    return result.path;
}

// ── API clients ──
const VALID_ASPECT_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
const VALID_IMAGE_SIZES = ['1K', '2K', '4K'];

// Convert an external https URL to a data URL. Some proxies (linkapi, OpenAI DALL-E with response_format=url)
// return image URLs instead of base64. Our saveImageToFile expects data URLs, so we download + encode first.
async function fetchUrlAsDataUrl(url) {
    try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`fetch ${resp.status}`);
        const blob = await resp.blob();
        const buf = await blob.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
        }
        return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`;
    } catch (e) {
        iigLog('WARN', `fetchUrlAsDataUrl fetch failed (${e.message}), trying canvas fallback`);
        // Canvas fallback — works if img CORS is allowed even when fetch is blocked
        return await new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
                    canvas.getContext('2d').drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/png'));
                } catch (canvasErr) {
                    reject(new Error(`Cannot save external image — CORS blocked both fetch and canvas. URL: ${String(url).slice(0, 120)}`));
                }
            };
            img.onerror = () => reject(new Error(`Cannot load image from ${String(url).slice(0, 120)}`));
            img.src = url;
        });
    }
}

async function generateImageOpenAI(prompt, style, referenceImages = [], options = {}) {
    const settings = getSettings();
    const endpoint = normalizeApiEndpoint(settings.endpoint);
    const model = settings.model;
    const aspectRatio = settings.aspectRatio === 'auto' ? (options.aspectRatio || '1:1') : (settings.aspectRatio || '1:1');
    const imageSize = options.imageSize || settings.imageSize || '1K';

    let fullPrompt = injectStyleBlock(prompt, style);
    fullPrompt = `${fullPrompt}\n\n[aspect_ratio: ${aspectRatio}] [image_size: ${imageSize}]`;

    // Build multimodal content with text + all reference images
    const refLabels = options.refLabels || [];
    const refNames = options.refNames || [];
    const imgCount = Math.min(referenceImages.length, MAX_GENERATION_REFERENCE_IMAGES);

    const instructions = [];
    const imageParts = [];
    for (let i = 0; i < imgCount; i++) {
        const label = refLabels[i] || 'reference';
        const name = refNames[i] || '';
        let instruction = '';
        if (label === 'char_face' || label === 'user_face') instruction = `Image ${i + 1} is ${name}'s FACE — preserve this face exactly.`;
        else if (label === 'char_outfit' || label === 'user_outfit') instruction = `Image ${i + 1} shows ${name}'s OUTFIT — preserve this clothing exactly.`;
        else if (label === 'npc_char' || label === 'npc_user' || label === 'npc_matched') instruction = `Image ${i + 1} is ${name} — preserve this appearance exactly.`;
        else if (label === 'context') instruction = `Image ${i + 1} is style/mood context.`;
        if (instruction) instructions.push(instruction);
        imageParts.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${referenceImages[i]}` } });
    }
    if (instructions.length > 0) {
        fullPrompt = `${instructions.join('\n')}\nGenerate the scene below. Keep all faces and outfits faithful to the references.\n\n${fullPrompt}`;
    }

    // ── Custom apiType: user supplies the FULL endpoint URL, we append
    // nothing. Body shape follows settings.customBodyFormat:
    //   'chat'   — same multimodal chat/completions body as openai mode
    //   'images' — DALL-E style images/generations body; this format has
    //              no slot for reference images, they're skipped with a log
    const isCustom = settings.apiType === 'custom';
    let url, body;
    if (isCustom && (settings.customBodyFormat || 'chat') === 'images') {
        if (imgCount > 0) iigLog('WARN', `Custom images/generations: формат не поддерживает рефы — ${imgCount} шт. пропущено`);
        url = String(settings.endpoint || '').trim().replace(/\/+$/, '');
        body = {
            ...(model ? { model } : {}),
            prompt: fullPrompt,
            n: 1,
            size: settings.size || '1024x1024',
            response_format: 'b64_json',
        };
        iigLog('INFO', `Custom images/generations: model=${model || '(default)'}, size=${body.size}, url=${url.slice(0, 60)}`);
    } else {
        const content = [{ type: 'text', text: fullPrompt }, ...imageParts];
        body = {
            ...(model ? { model } : {}),
            messages: [{ role: 'user', content }],
            modalities: ['image', 'text'],
            stream: false,
        };
        url = isCustom
            ? String(settings.endpoint || '').trim().replace(/\/+$/, '')
            : `${endpoint}/v1/chat/completions`;
        iigLog('INFO', `${isCustom ? 'Custom chat.completions' : 'OpenAI chat.completions'}: model=${model || '(default)'}, ratio=${aspectRatio}, size=${imageSize}, refs=${imgCount}`);
    }
    const response = await robustFetch(url, { method: 'POST', headers: buildAuthHeaders(settings.apiKey, { 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
    if (!response.ok) { const text = await response.text(); throw new Error(`API Error (${response.status}): ${text}`); }
    const result = await response.json();
    const found = extractImageFromChatResponse(result);
    if (!found) throw new Error('No image data in response (tried chat.completions message.images, content parts, content string, data[])');
    // If we got a bare https URL (some proxies hand back CDN links, e.g. linkapi→Alibaba OSS) — download and re-encode as data URL
    if (typeof found === 'string' && /^https?:\/\//i.test(found)) {
        iigLog('INFO', `Response was URL, fetching and encoding: ${found.slice(0, 80)}`);
        return await fetchUrlAsDataUrl(found);
    }
    return found;
}

// Extract image payload from a chat.completions-style response. Returns either a data URL or a bare URL,
// or null if nothing found. Tries 5 common shapes used by different proxies.
function extractImageFromChatResponse(result) {
    const msg = result?.choices?.[0]?.message;
    if (msg) {
        // 1. OpenRouter/api.navy style — images array with image_url.url
        if (Array.isArray(msg.images) && msg.images.length > 0) {
            const img = msg.images[0];
            if (img?.image_url?.url) return img.image_url.url;
            if (typeof img === 'string') return img;
            if (img?.url) return img.url;
            if (img?.b64_json) return `data:image/png;base64,${img.b64_json}`;
        }
        // 2. content array — look for image_url part
        if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
                if (part?.type === 'image_url' && part?.image_url?.url) return part.image_url.url;
                if (part?.type === 'image' && part?.source?.data) return `data:${part.source.media_type || 'image/png'};base64,${part.source.data}`;
            }
        }
        // 3. content string — may contain data URL or markdown image or bare URL
        if (typeof msg.content === 'string' && msg.content) {
            const dataUrlMatch = msg.content.match(/data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+/);
            if (dataUrlMatch) return dataUrlMatch[0];
            const mdMatch = msg.content.match(/!\[[^\]]*\]\((https?:\/\/[^)]+|data:image\/[^)]+)\)/);
            if (mdMatch) return mdMatch[1];
            const urlMatch = msg.content.match(/https?:\/\/\S+\.(?:png|jpe?g|webp|gif)(?:\?\S*)?/i);
            if (urlMatch) return urlMatch[0];
        }
        // 4. direct image_url on message
        if (msg.image_url?.url) return msg.image_url.url;
    }
    // 5. legacy /v1/images/generations shape (in case a proxy still returns this)
    if (Array.isArray(result?.data) && result.data.length > 0) {
        const d = result.data[0];
        if (d.b64_json) return `data:image/png;base64,${d.b64_json}`;
        if (d.url) return d.url;
    }
    return null;
}

async function generateImageGemini(prompt, style, referenceImages = [], options = {}) {
    const settings = getSettings();
    const model = settings.model;
    const url = `${normalizeApiEndpoint(settings.endpoint)}/v1beta/models/${model}:generateContent`;
    let aspectRatio = settings.aspectRatio === 'auto' ? (options.aspectRatio || '1:1') : (settings.aspectRatio || '1:1');
    if (!VALID_ASPECT_RATIOS.includes(aspectRatio)) aspectRatio = '1:1';
    let imageSize = options.imageSize || settings.imageSize || '1K';
    if (!VALID_IMAGE_SIZES.includes(imageSize)) imageSize = VALID_IMAGE_SIZES.includes(settings.imageSize) ? settings.imageSize : '1K';

    const parts = [];
    const refLabels = options.refLabels || [];
    const refNames = options.refNames || [];

    // Build human-readable labels with names
    const imgCount = Math.min(referenceImages.length, MAX_GENERATION_REFERENCE_IMAGES);
    const instructions = [];

    for (let i = 0; i < imgCount; i++) {
        const label = refLabels[i] || 'reference';
        const name = refNames[i] || '';

        let instruction = '';
        if (label === 'char_face') instruction = `Image ${i + 1} is ${name}'s FACE — preserve this face exactly.`;
        else if (label === 'user_face') instruction = `Image ${i + 1} is ${name}'s FACE — preserve this face exactly.`;
        else if (label === 'char_outfit') instruction = `Image ${i + 1} shows ${name}'s OUTFIT — preserve this clothing exactly.`;
        else if (label === 'user_outfit') instruction = `Image ${i + 1} shows ${name}'s OUTFIT — preserve this clothing exactly.`;
        else if (label === 'npc_char') instruction = `Image ${i + 1} is ${name} — preserve this appearance exactly.`;
        else if (label === 'npc_user') instruction = `Image ${i + 1} is ${name} — preserve this appearance exactly.`;
        else if (label === 'npc_matched') instruction = `Image ${i + 1} is NPC "${name}" — preserve this appearance exactly.`;
        else if (label === 'context') instruction = `Image ${i + 1} is style/mood context.`;

        if (instruction) instructions.push(instruction);
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: referenceImages[i] } });
    }

    let fullPrompt = injectStyleBlock(prompt, style);

    if (instructions.length > 0) {
        const refBlock = instructions.join('\n') + '\nGenerate the scene below. Keep all faces and outfits faithful to the references.';
        fullPrompt = `${refBlock}\n\n${fullPrompt}`;
    }

    parts.push({ text: fullPrompt });

    const body = { contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio, imageSize } } };
    iigLog('INFO', `Gemini: model=${model}, ratio=${aspectRatio}, size=${imageSize}, refs=${referenceImages.length}`);

    const response = await robustFetch(url, { method: 'POST', headers: buildAuthHeaders(settings.apiKey, { 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
    if (!response.ok) { const text = await response.text(); throw new Error(`API Error (${response.status}): ${text}`); }
    const result = await response.json();
    const candidates = result.candidates || [];
    if (candidates.length === 0) throw new Error('No candidates in response');
    const responseParts = candidates[0].content?.parts || [];
    for (const part of responseParts) {
        if (part.inlineData) return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        if (part.inline_data) return `data:${part.inline_data.mime_type};base64,${part.inline_data.data}`;
    }
    throw new Error('No image found in Gemini response');
}

async function generateImageNaistera(prompt, style, options = {}) {
    const settings = getSettings();
    const endpoint = getEffectiveEndpoint(settings);
    const url = endpoint.endsWith('/api/generate') ? endpoint : `${endpoint}/api/generate`;
    const aspectRatio = settings.naisteraAspectRatio === 'auto' ? (options.aspectRatio || '1:1') : (settings.naisteraAspectRatio || '1:1');
    const model = normalizeNaisteraModel(options.model || settings.naisteraModel || 'grok');
    const referenceImages = options.referenceImages || [];
    const referenceLabels = options.referenceLabels || [];
    let labelPrefix = '';
    if (referenceImages.length > 0 && referenceLabels.length > 0) {
        const labelList = referenceImages.map((_, i) => `${i + 1}=${referenceLabels[i] || 'reference'}`).join(', ');
        labelPrefix = `[Reference images attached, in order: ${labelList}. Use each reference for ITS OWN named subject only — do not mix attributes between subjects.] `;
        iigLog('INFO', `Naistera ref labels: ${labelList}`);
    }
    const fullPrompt = labelPrefix + injectStyleBlock(prompt, style);
    const wantsVideoTest = Boolean(options.videoTestMode);
    const videoEveryN = normalizeNaisteraVideoFrequency(options.videoEveryN ?? settings.naisteraVideoEveryN);

    const body = { prompt: fullPrompt, aspect_ratio: aspectRatio, model };
    if (options.preset) body.preset = options.preset;
    if (referenceImages.length > 0) body.reference_images = referenceImages.slice(0, MAX_GENERATION_REFERENCE_IMAGES);
    if (wantsVideoTest) { body.video_test_mode = true; body.video_test_every_n_messages = videoEveryN; }

    let response;
    try {
        response = await robustFetch(url, { method: 'POST', headers: buildAuthHeaders(settings.apiKey, { 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
    } catch (error) {
        const pageOrigin = window.location.origin;
        let endpointOrigin = endpoint;
        try { endpointOrigin = new URL(url, window.location.href).origin; } catch (pe) { }
        throw new Error(`Network/CORS error requesting ${endpointOrigin} from ${pageOrigin}. Original: ${error?.message || 'Failed to fetch'}`);
    }
    if (!response.ok) { const text = await response.text(); throw new Error(`API Error (${response.status}): ${text}`); }
    const result = await response.json();
    if (!result?.data_url) throw new Error('No data_url in response');
    if (result.media_kind === 'video') {
        return { kind: 'video', dataUrl: result.data_url, posterDataUrl: result.poster_data_url || '', contentType: result.content_type || 'video/mp4' };
    }
    return result.data_url;
}

// ── Validation ──
function validateSettings() {
    const settings = getSettings();
    const errors = [];
    if (!settings.endpoint && settings.apiType !== 'naistera') errors.push('URL эндпоинта не настроен');
    if (!settings.apiKey) errors.push('API ключ не настроен');
    // Custom endpoints often pin the model server-side — model is optional there.
    if (settings.apiType !== 'naistera' && settings.apiType !== 'custom' && !settings.model) errors.push('Модель не выбрана');
    if (settings.apiType === 'naistera') {
        const m = normalizeNaisteraModel(settings.naisteraModel);
        if (!NAISTERA_MODELS.includes(m)) errors.push('Для Naistera выберите модель: grok / nano banana');
    }
    if (errors.length > 0) throw new Error(`Ошибка настроек: ${errors.join(', ')}`);
}

function sanitizeForHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    // Quotes too — same attribute-context problem as esc() in the wardrobe module.
    return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── ST-native popups (with window.prompt/confirm fallback for old builds) ──
// callGenericPopup lives in ST's popup.js and renders the same themed dialog
// the rest of the UI uses. POPUP_TYPE: TEXT=1, CONFIRM=2, INPUT=3 (hardcoded
// fallback numbers for ST builds that don't export POPUP_TYPE on the context).
// ── Обрезка картинки перед загрузкой ─────────────────────────────────────
// Built as its own overlay rather than through callGenericPopup: this needs
// pointer-drag over the image and three custom actions, and a popup wrapper
// would fight both. Returns a data URL (cropped or whole), or null if the user
// backed out entirely — callers must treat null as "abandon the upload".
//
// Mobile is the primary case, not an afterthought: the stage is sized in dvh so
// the browser chrome collapsing doesn't clip it, handles are finger-sized, the
// aspect row scrolls instead of wrapping, and touch-action:none stops a drag
// from scrolling the page underneath.
function slayCropImage(dataUrl, opts = {}) {
    const aspectDefault = typeof opts.aspect === 'number' ? opts.aspect : 0;   // w/h, 0 = free
    // Free by default: forcing a frame onto a picture the user has not looked at
    // yet is a decision made for them. The ratio buttons are right there.
    const title = opts.title || 'Обрезать перед загрузкой';
    const subtitle = opts.subtitle || '';

    return new Promise((resolve) => {
        const ov = document.createElement('div');
        ov.className = 'slay-crop-ov';
        ov.innerHTML = `
            <div class="slay-crop-box" role="dialog" aria-label="${sanitizeForHtml(title)}">
                <div class="slay-crop-head">
                    <div>
                        <div class="slay-crop-t">${sanitizeForHtml(title)}</div>
                        ${subtitle ? `<div class="slay-crop-s">${sanitizeForHtml(subtitle)}</div>` : ''}
                    </div>
                    <button class="slay-crop-x" type="button" aria-label="Отмена"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="slay-crop-asp">
                    <button class="slay-asp" data-a="0.75">3:4</button>
                    <button class="slay-asp" data-a="1">1:1</button>
                    <button class="slay-asp" data-a="0.667">2:3</button>
                    <button class="slay-asp" data-a="1.333">4:3</button>
                    <button class="slay-asp on" data-a="0">Свободно</button>
                </div>
                <div class="slay-crop-stage">
                    <img class="slay-crop-img" alt="">
                    <div class="slay-crop-rect">
                        <span class="slay-crop-h nw" data-h="nw"></span><span class="slay-crop-h ne" data-h="ne"></span>
                        <span class="slay-crop-h sw" data-h="sw"></span><span class="slay-crop-h se" data-h="se"></span>
                    </div>
                </div>
                <div class="slay-crop-info"><span class="slay-crop-size">—</span><span class="slay-crop-cut"></span></div>
                <div class="slay-crop-btns">
                    <button class="slay-crop-b primary" data-act="crop">Обрезать</button>
                    <button class="slay-crop-b" data-act="whole">Взять целиком</button>
                    <button class="slay-crop-b ghost" data-act="reset" title="Сбросить рамку"><i class="fa-solid fa-rotate-left"></i></button>
                </div>
            </div>`;
        document.body.appendChild(ov);

        const box    = ov.querySelector('.slay-crop-box');
        const stage  = ov.querySelector('.slay-crop-stage');
        const img    = ov.querySelector('.slay-crop-img');
        const rect   = ov.querySelector('.slay-crop-rect');
        const sizeEl = ov.querySelector('.slay-crop-size');
        const cutEl  = ov.querySelector('.slay-crop-cut');

        let aspect = aspectDefault;
        let b = { x: 0, y: 0, w: 0, h: 0 };            // stage pixels, for display
        let nb = { x: 0, y: 0, w: 1, h: 1 };           // fractions of the picture — authoritative
        const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

        const markAspect = () => {
            for (const el of ov.querySelectorAll('.slay-asp')) {
                el.classList.toggle('on', parseFloat(el.dataset.a) === aspect);
            }
        };

        // Where the picture actually sits inside the stage. The stage is a flex
        // box that centres the image, so a portrait in a wide stage leaves black
        // bars either side — and measuring against the stage let the frame (and
        // the crop maths) run out over that emptiness.
        function imgBox() {
            const sr = stage.getBoundingClientRect();
            const ir = img.getBoundingClientRect();
            return { x: ir.left - sr.left, y: ir.top - sr.top, w: ir.width, h: ir.height };
        }

        function fit() {
            const box0 = imgBox();
            if (!box0.w || !box0.h) return;
            let w, h;
            if (!aspect) { w = box0.w; h = box0.h; }
            else if (box0.w / box0.h > aspect) { h = box0.h; w = h * aspect; }
            else { w = box0.w; h = w / aspect; }
            b = { x: box0.x + (box0.w - w) / 2, y: box0.y + (box0.h - h) / 2, w, h };
            draw();
        }

        function draw() {
            const box0 = imgBox();
            if (!box0.w || !box0.h) return;
            // The frame may never leave the picture: everything outside it is
            // stage background, and cropping it would bake black bars into the ref.
            b.w = clamp(b.w, 32, box0.w); b.h = clamp(b.h, 32, box0.h);
            b.x = clamp(b.x, box0.x, box0.x + box0.w - b.w);
            b.y = clamp(b.y, box0.y, box0.y + box0.h - b.h);
            rect.style.left = b.x + 'px'; rect.style.top = b.y + 'px';
            rect.style.width = b.w + 'px'; rect.style.height = b.h + 'px';
            // Record the frame as fractions of the picture, every time it moves.
            nb = {
                x: (b.x - box0.x) / box0.w,
                y: (b.y - box0.y) / box0.h,
                w: b.w / box0.w,
                h: b.h / box0.h,
            };
            if (img.naturalWidth) {
                const sw = Math.round(nb.w * img.naturalWidth);
                const sh = Math.round(nb.h * img.naturalHeight);
                sizeEl.textContent = `${sw} × ${sh}`;
                const cut = Math.max(0, Math.round((1 - nb.w * nb.h) * 100));
                cutEl.textContent = cut ? `отброшено ${cut}%` : 'вся картинка';
            }
        }

        // One pointer path for mouse and finger alike.
        let drag = null;
        stage.addEventListener('pointerdown', (e) => {
            const h = e.target.closest('.slay-crop-h');
            const inside = e.target === rect || rect.contains(e.target);
            if (!h && !inside) return;
            try { stage.setPointerCapture(e.pointerId); } catch (_) {}
            drag = { h: h ? h.dataset.h : null, sx: e.clientX, sy: e.clientY, b: { ...b } };
            e.preventDefault();
        });
        stage.addEventListener('pointermove', (e) => {
            if (!drag) return;
            const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy, o = drag.b;
            if (!drag.h) { b.x = o.x + dx; b.y = o.y + dy; draw(); return; }
            // Resize from a corner, keeping the opposite corner pinned.
            let nx = o.x, ny = o.y, nw = o.w, nh = o.h;
            if (drag.h === 'se') { nw = o.w + dx; nh = aspect ? nw / aspect : o.h + dy; }
            if (drag.h === 'sw') { nw = o.w - dx; nh = aspect ? nw / aspect : o.h + dy; nx = o.x + o.w - nw; }
            if (drag.h === 'ne') { nw = o.w + dx; nh = aspect ? nw / aspect : o.h - dy; ny = o.y + o.h - nh; }
            if (drag.h === 'nw') { nw = o.w - dx; nh = aspect ? nw / aspect : o.h - dy; nx = o.x + o.w - nw; ny = o.y + o.h - nh; }
            if (nw < 32 || nh < 32) return;
            b = { x: nx, y: ny, w: nw, h: nh };
            draw();
        });
        const endDrag = (e) => { if (drag) { drag = null; try { stage.releasePointerCapture(e.pointerId); } catch (_) {} } };
        stage.addEventListener('pointerup', endDrag);
        stage.addEventListener('pointercancel', endDrag);

        // Re-shape around the frame's current centre, and never larger than the
        // picture — so switching 3:4 → 1:1 keeps you looking at the same spot.
        function reshape() {
            if (!aspect) { draw(); return; }
            const box0 = imgBox();
            if (!box0.w || !box0.h) return;
            const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
            let w = Math.min(b.w, box0.w);
            let h = w / aspect;
            if (h > box0.h) { h = box0.h; w = h * aspect; }
            b = { x: cx - w / 2, y: cy - h / 2, w, h };
            draw();
        }

        ov.querySelector('.slay-crop-asp').addEventListener('click', (e) => {
            const btn = e.target.closest('.slay-asp'); if (!btn) return;
            aspect = parseFloat(btn.dataset.a);
            markAspect();
            reshape();
        });

        let settled = false;
        const cleanups = [];
        const finish = (val) => {
            for (const fn of cleanups) { try { fn(); } catch (_) {} }
            if (settled) return;
            settled = true;
            ov.remove();
            document.removeEventListener('keydown', onKey, true);
            resolve(val);
        };
        const onKey = (e) => {
            if (e.key !== 'Escape' && e.key !== 'Enter') return;
            // Capture phase + stop: Escape used to travel on to the wardrobe's
            // own handler, so cropping something opened from the wardrobe closed
            // the wardrobe too.
            e.stopPropagation();
            e.preventDefault();
            if (e.key === 'Escape') finish(null);
            else doCrop();
        };
        document.addEventListener('keydown', onKey, true);

        function doCrop() {
            if (!img.naturalWidth) return finish(dataUrl);
            const NW = img.naturalWidth, NH = img.naturalHeight;
            // Straight from the fractions the frame was drawn with — no second
            // measurement, so nothing can have moved in between. Clamped so
            // rounding can never ask for a pixel outside the image.
            const cl = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
            let sx = Math.round(cl(nb.x, 0, 1) * NW);
            let sy = Math.round(cl(nb.y, 0, 1) * NH);
            let sw = Math.round(cl(nb.w, 0, 1) * NW);
            let sh = Math.round(cl(nb.h, 0, 1) * NH);
            sw = Math.max(1, Math.min(sw, NW - sx));
            sh = Math.max(1, Math.min(sh, NH - sy));
            // Whole picture selected — hand back the original bytes untouched so
            // we never re-encode (and never lose) an image nobody wanted cropped.
            if (sx <= 1 && sy <= 1 && sw >= NW - 2 && sh >= NH - 2) return finish(dataUrl);
            try {
                const c = document.createElement('canvas');
                c.width = sw; c.height = sh;
                c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
                const mime = /^data:image\/png/i.test(dataUrl) ? 'image/png' : 'image/jpeg';
                finish(c.toDataURL(mime, mime === 'image/jpeg' ? 0.92 : undefined));
            } catch (err) {
                iigLog('WARN', 'crop failed, using original:', err?.message);
                finish(dataUrl);
            }
        }

        ov.querySelector('.slay-crop-btns').addEventListener('click', (e) => {
            const btn = e.target.closest('.slay-crop-b'); if (!btn) return;
            if (btn.dataset.act === 'crop') doCrop();
            if (btn.dataset.act === 'whole') finish(dataUrl);
            if (btn.dataset.act === 'reset') fit();
        });
        ov.querySelector('.slay-crop-x').addEventListener('click', () => finish(null));
        // The overlay is a child of <body>, so every click inside it also reaches
        // the document-level "clicked outside" handlers — which promptly closed
        // the wardrobe modal and the ref popups. Pressing "Обрезать" tore down
        // everything underneath. Swallow the whole family of pointer events at
        // the overlay: the buttons' own listeners run first in the target phase,
        // and nothing escapes afterwards. pointerdown on the backdrop itself
        // still means cancel.
        // Ignore backdrop taps for a moment after opening. On iOS the touch that
        // dismisses the native photo picker arrives here as a pointerdown on the
        // freshly-created overlay, which cancelled the crop before it was seen.
        const openedAt = Date.now();
        for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend']) {
            ov.addEventListener(type, (e) => {
                if (type === 'pointerdown' && e.target === ov && Date.now() - openedAt > 400) finish(null);
                e.stopPropagation();
            });
        }

        img.addEventListener('load', () => { markAspect(); fit(); });
        // If the browser cannot decode it (an odd format, a photo too large for
        // the device), don't sit there with an empty frame — say so and let the
        // upload continue uncropped rather than dying silently.
        img.addEventListener('error', () => {
            iigLog('WARN', 'crop: image failed to decode, continuing without cropping');
            toastr.info('Не удалось открыть картинку для обрезки — загружаю как есть', 'SLAY Images', { timeOut: 3000 });
            finish(dataUrl);
        });
        img.src = dataUrl;
        // Refit on resize, and stop when the dialog is gone — otherwise the
        // listener keeps firing against detached nodes for the rest of the session.
        addEventListener('resize', fit, { passive: true });
        cleanups.push(() => removeEventListener('resize', fit));
    });
}

// Should we offer the crop step at all? Opt-out, phrased as the user asked:
// the checkbox says "не предлагать", so the stored flag is the skip.
// Crop a picture that is already saved. Writes a NEW file rather than replacing
// the old one: the same path can be referenced by another character, another
// look or a slot in a different chat, and silently reshaping it under them would
// be the sort of quiet data damage we spent today removing. The old file stays
// on disk for "найти ничьи картинки" to sweep up later.
// Returns the new path, the original path if nothing changed, or null on cancel.
async function slayRecropExisting(path, opts = {}) {
    if (!path) return null;
    try {
        const b64 = await loadRefImageAsBase64(path);
        if (!b64) { toastr.error('Не удалось открыть картинку', 'SLAY Images'); return null; }
        const mime = detectImageMimeFromBase64(b64);
        const out = await slayCropImage(`data:${mime};base64,${b64}`, {
            aspect: typeof opts.aspect === 'number' ? opts.aspect : 0,
            title: opts.title || 'Обрезать картинку',
            subtitle: opts.subtitle || 'Исходный файл останется на месте',
        });
        if (out === null) return null;
        const cropped = String(out).split(',')[1];
        if (!cropped || cropped === b64) return path;          // untouched
        const t = toastr.info('Сохраняю...', 'SLAY Images', { timeOut: 0, extendedTimeOut: 0 });
        try {
            const hashes = await computeRefHashes(cropped);
            const payload = hashes.compressed || await compressBase64Image(cropped, 768, 0.8);
            const saved = await saveRefImageToFile(payload, opts.label || 'crop', { skipDedupCheck: true });
            recordRefHashes(hashes, saved);
            return saved;
        } finally { try { toastr.clear(t); } catch (_) {} }
    } catch (e) {
        toastr.error('Обрезка не удалась: ' + (e?.message || e), 'SLAY Images');
        return null;
    }
}

// Small chooser: a question with several named answers, because slayConfirm's
// yes/no forces "delete everything or nothing" on a decision that has three
// sensible outcomes. Returns the chosen key, or null.
function slayChoose(title, text, options) {
    return new Promise((resolve) => {
        const ov = document.createElement('div');
        ov.className = 'slay-choose-ov';
        ov.innerHTML = `
            <div class="slay-choose-box">
                <div class="slay-choose-t">${sanitizeForHtml(title)}</div>
                <div class="slay-choose-x">${sanitizeForHtml(text).replace(/@BR@/g, '<br>')}</div>
                <div class="slay-choose-btns">
                    ${options.map(o => `<button class="slay-choose-b${o.danger ? ' danger' : ''}${o.primary ? ' primary' : ''}" data-k="${sanitizeForHtml(o.key)}">${sanitizeForHtml(o.label)}</button>`).join('')}
                    <button class="slay-choose-b ghost" data-k="">Отмена</button>
                </div>
            </div>`;
        document.body.appendChild(ov);
        let done = false;
        const finish = (k) => { if (done) return; done = true; ov.remove(); document.removeEventListener('keydown', onKey, true); resolve(k || null); };
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); finish(null); } };
        document.addEventListener('keydown', onKey, true);
        // Same isolation the crop overlay needs: these clicks must not reach the
        // document-level handlers that close the wardrobe and the ref popups.
        for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend']) {
            ov.addEventListener(type, (e) => {
                if (type === 'click') {
                    const b = e.target.closest('.slay-choose-b');
                    if (b) finish(b.dataset.k);
                    else if (e.target === ov) finish(null);
                }
                e.stopPropagation();
            });
        }
    });
}

function slayCropEnabled() {
    try { return getSettings().skipCrop !== true; } catch (_) { return true; }
}

// Convenience wrapper for the upload paths: hands back raw base64, not a data
// URL, because that is what every caller already works with. `null` means the
// user cancelled and the upload must stop.
async function slayMaybeCrop(rawBase64, opts = {}) {
    if (!slayCropEnabled()) return rawBase64;
    const mime = detectImageMimeFromBase64(rawBase64);
    const out = await slayCropImage(`data:${mime};base64,${rawBase64}`, opts);
    if (out === null) return null;
    return String(out).split(',')[1] || rawBase64;
}

async function slayPromptInput(title, defaultValue = '') {
    // A leftover toast paints above the popup layer and covers the very
    // field the user is meant to type into. Clear the area before showing.
    try { toastr.clear(); } catch (_) {}
    const ctx = SillyTavern.getContext();
    try {
        if (typeof ctx.callGenericPopup === 'function') {
            const INPUT = ctx.POPUP_TYPE?.INPUT ?? 3;
            const res = await ctx.callGenericPopup(title, INPUT, String(defaultValue));
            return (typeof res === 'string') ? res : null; // false/null/undefined = cancelled
        }
    } catch (e) { iigLog('WARN', 'callGenericPopup(INPUT) failed, falling back to prompt:', e.message); }
    const v = window.prompt(title, String(defaultValue));
    return v === null ? null : v;
}

// Name AND note in ONE dialog. Asking for them in two prompts back to back made
// saving a portrait feel like an interrogation, and the second box gave no hint
// that it belonged to the same action. Returns { name, note } or null if cancelled.
// Save dialog for a portrait: is this a NEW character or ANOTHER look for one
// we already know? The answer is usually obvious from the name already typed
// into the slot, so we work it out first and let the user override.
// Returns { charId, names, label } or null.
// A <select> of seventeen people is unusable and only gets worse. This is a
// filter box over a short list instead: type any part of a name and only those
// who answer to it remain. Seeded by the caller, so the common case opens
// already narrowed to the right person.
function swBuildCharPicker(chars, opts) {
    opts = opts || {};
    const esc = sanitizeForHtml;
    const box = document.createElement('div');
    box.innerHTML = `
        <input type="text" class="text_pole slk-search" placeholder="\u041f\u043e\u0438\u0441\u043a \u043f\u043e \u0438\u043c\u0435\u043d\u0438" value="${esc(opts.seed || '')}" style="margin-bottom:5px;">
        <div class="slk-list"></div>
        <div class="slk-none" style="display:none;">\u041d\u0438\u043a\u0442\u043e \u043d\u0435 \u043f\u043e\u0434\u0445\u043e\u0434\u0438\u0442</div>`;
    const search = box.querySelector('.slk-search');
    const list = box.querySelector('.slk-list');
    const none = box.querySelector('.slk-none');
    let chosen = opts.selectedId || null;

    const draw = () => {
        const q = search.value.trim().toLowerCase();
        // Match any single name, the same way a ref matches a prompt.
        const hits = !q ? chars : chars.filter(c => swNameList(c.names).some(n => n.toLowerCase().includes(q)));
        if (!hits.some(c => c.id === chosen)) chosen = hits.length ? hits[0].id : null;
        none.style.display = hits.length ? 'none' : '';
        list.innerHTML = hits.map(c => `
            <button type="button" class="slk-row${c.id === chosen ? ' on' : ''}" data-id="${esc(c.id)}">
                <img src="${esc(c.looks[0].path)}" alt="" loading="lazy">
                <span class="slk-row-n">${esc(c.names)}</span>
                <span class="slk-row-c">${c.looks.length}</span>
            </button>`).join('');
        for (const row of list.querySelectorAll('.slk-row')) {
            row.addEventListener('click', (e) => { e.preventDefault(); chosen = row.dataset.id; draw(); });
        }
    };
    search.addEventListener('input', draw);
    draw();
    return { el: box, get value() { return chosen; } };
}

async function slayPromptSaveLook(typedNames, path) {
    // A leftover toast paints above the popup layer and covers the very
    // field the user is meant to type into. Clear the area before showing.
    try { toastr.clear(); } catch (_) {}
    const ctx = SillyTavern.getContext();
    const chars = getSavedChars();
    const byPath = findSavedCharByPath(path);
    const match = byPath || findSavedCharByNames(typedNames);
    const esc2 = (v) => String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    try {
        if (typeof ctx.callGenericPopup === 'function') {
            const CONFIRM = ctx.POPUP_TYPE && ctx.POPUP_TYPE.CONFIRM ? ctx.POPUP_TYPE.CONFIRM : 2;
            const wrap = document.createElement('div');
            wrap.style.cssText = 'text-align:left;display:flex;flex-direction:column;gap:4px;';
            wrap.innerHTML = `
                <div style="font-size:15px;font-weight:600;color:#f472b6;margin-bottom:6px;" id="slk_title"></div>
                ${match ? `<div style="display:flex;gap:8px;align-items:flex-start;background:rgba(244,114,182,.10);border:1px solid rgba(244,114,182,.28);border-radius:8px;padding:8px 10px;font-size:12px;line-height:1.45;margin-bottom:8px;">
                    <span style="color:#f472b6;">\u2665</span>
                    <div><b>${esc2(match.names)}</b> \u2014 \u0443\u0436\u0435 \u0435\u0441\u0442\u044c, ${match.looks.length} \u043e\u0431\u0440\u0430\u0437(\u0430).<br>
                    <span style="opacity:.6;">\u041f\u043e\u0445\u043e\u0436\u0435, \u044d\u0442\u043e \u0435\u0449\u0451 \u043e\u0434\u0438\u043d \u0435\u0433\u043e \u043e\u0431\u0440\u0430\u0437.</span></div>
                </div>` : ''}
                ${chars.length ? `<div style="display:flex;gap:4px;background:rgba(0,0,0,.25);padding:3px;border-radius:9px;margin-bottom:6px;">
                    <button type="button" id="slk_new" style="flex:1;padding:6px;border:none;border-radius:7px;background:transparent;color:#bbb;font:inherit;font-size:12px;cursor:pointer;">\u041d\u043e\u0432\u044b\u0439 \u043f\u0435\u0440\u0441\u043e\u043d\u0430\u0436</button>
                    <button type="button" id="slk_add" style="flex:1;padding:6px;border:none;border-radius:7px;background:transparent;color:#bbb;font:inherit;font-size:12px;cursor:pointer;">\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u043e\u0431\u0440\u0430\u0437</button>
                </div>` : ''}
                <div id="slk_f_names">
                    <label style="font-size:12px;opacity:.8;">\u0418\u043c\u0435\u043d\u0430 \u0447\u0435\u0440\u0435\u0437 \u0437\u0430\u043f\u044f\u0442\u0443\u044e</label>
                    <input type="text" id="slk_names" class="text_pole" value="${esc2(typedNames)}" placeholder="\u0414\u0435\u043d, \u0414\u0435\u043d\u0438\u0441, \u0414\u0435\u043d\u0447\u0438\u043a">
                    <div style="font-size:11px;opacity:.55;margin-bottom:6px;">\u043f\u043e \u043d\u0438\u043c \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043d\u0438\u0435 \u0443\u0437\u043d\u0430\u0451\u0442 \u043f\u0435\u0440\u0441\u043e\u043d\u0430\u0436\u0430 \u0432 \u043f\u0440\u043e\u043c\u043f\u0442\u0435</div>
                </div>
                <div id="slk_f_who" style="display:none;">
                    <label style="font-size:12px;opacity:.8;">\u041a\u043e\u043c\u0443</label>
                    <div id="slk_who_host"></div>
                    <div style="font-size:11px;opacity:.55;margin-bottom:6px;">\u0438\u043c\u0435\u043d\u0430 \u0443\u0436\u0435 \u0437\u0430\u043f\u0438\u0441\u0430\u043d\u044b \u2014 \u0432\u043f\u0438\u0441\u044b\u0432\u0430\u0442\u044c \u0437\u0430\u043d\u043e\u0432\u043e \u043d\u0435 \u043d\u0443\u0436\u043d\u043e</div>
                </div>
                <label style="font-size:12px;opacity:.8;">\u041e\u0431\u0440\u0430\u0437</label>
                <input type="text" id="slk_label" class="text_pole" value="" placeholder="\u041c\u0430\u0444\u0438\u044f, \u041a\u043e\u043b\u0434\u043e\u0432\u0441\u0442\u0432\u043e\u0440\u0435\u0446, Basic">
                <div style="font-size:11px;opacity:.55;">\u043f\u043e\u0434\u043f\u0438\u0441\u044c \u043f\u043e\u0434 \u043a\u0430\u0440\u0442\u0438\u043d\u043a\u043e\u0439, \u0432 \u043f\u0440\u043e\u043c\u043f\u0442 \u043d\u0435 \u043f\u043e\u043f\u0430\u0434\u0430\u0435\u0442</div>`;

            let mode = match ? 'add' : 'new';
            const bNew = wrap.querySelector('#slk_new'), bAdd = wrap.querySelector('#slk_add');
            const setMode = (m) => {
                mode = m;
                wrap.querySelector('#slk_f_names').style.display = m === 'new' ? '' : 'none';
                wrap.querySelector('#slk_f_who').style.display = m === 'add' ? '' : 'none';
                wrap.querySelector('#slk_title').textContent = m === 'add'
                    ? '\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u043e\u0431\u0440\u0430\u0437'
                    : '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u043f\u0435\u0440\u0441\u043e\u043d\u0430\u0436\u0430';
                if (bNew && bAdd) {
                    for (const [b, k] of [[bNew, 'new'], [bAdd, 'add']]) {
                        const on = k === m;
                        b.style.background = on ? 'rgba(244,114,182,.22)' : 'transparent';
                        b.style.color = on ? '#f472b6' : '#bbb';
                        b.style.fontWeight = on ? '600' : '400';
                    }
                }
            };
            if (bNew) bNew.addEventListener('click', (e) => { e.preventDefault(); setMode('new'); });
            if (bAdd) bAdd.addEventListener('click', (e) => { e.preventDefault(); setMode('add'); });
            setMode(mode);
            // Seed the filter with the name already in the slot: saving
            // "Dana, Дана" opens the list showing only the Danas.
            const picker = swBuildCharPicker(chars, {
                selectedId: match ? match.id : null,
                seed: swNameList(match ? match.names : typedNames)[0] || '',
            });
            const whoHost = wrap.querySelector('#slk_who_host');
            if (whoHost) whoHost.appendChild(picker.el);
            const whoSel = { get value() { return picker.value; } };
            // Re-saving a picture that is already filed: offer its current label.
            if (byPath) {
                const cur = byPath.looks.find(l => l.path === path);
                if (cur) wrap.querySelector('#slk_label').value = cur.label || '';
            }

            const okd = await ctx.callGenericPopup(wrap, CONFIRM);
            if (!okd) return null;
            const label = (wrap.querySelector('#slk_label').value || '').trim();
            if (mode === 'add' && whoSel) return { charId: whoSel.value, names: '', label };
            return { charId: null, names: (wrap.querySelector('#slk_names').value || '').trim(), label };
        }
    } catch (e) { iigLog('WARN', 'save-look popup failed, falling back:', e.message); }

    const n = window.prompt('\u0418\u043c\u0435\u043d\u0430 \u0447\u0435\u0440\u0435\u0437 \u0437\u0430\u043f\u044f\u0442\u0443\u044e:', match ? match.names : typedNames);
    if (n === null) return null;
    const lb = window.prompt('\u041f\u043e\u0434\u043f\u0438\u0441\u044c \u043e\u0431\u0440\u0430\u0437\u0430 (\u041c\u0430\u0444\u0438\u044f, Basic):', '');
    return { charId: match ? match.id : null, names: n.trim(), label: lb === null ? '' : lb.trim() };
}

async function slayConfirm(text) {
    // A leftover toast paints above the popup layer and covers the very
    // field the user is meant to type into. Clear the area before showing.
    try { toastr.clear(); } catch (_) {}
    const ctx = SillyTavern.getContext();
    try {
        if (typeof ctx.callGenericPopup === 'function') {
            const CONFIRM = ctx.POPUP_TYPE?.CONFIRM ?? 2;
            const res = await ctx.callGenericPopup(text, CONFIRM);
            return res === true || res === 1; // POPUP_RESULT.AFFIRMATIVE === 1
        }
    } catch (e) { iigLog('WARN', 'callGenericPopup(CONFIRM) failed, falling back to confirm:', e.message); }
    return window.confirm(text);
}

function isGeneratedVideoResult(value) {
    return Boolean(value) && typeof value === 'object' && value.kind === 'video' && typeof value.dataUrl === 'string';
}

function createGeneratedMediaElement(result, tag) {
    if (isGeneratedVideoResult(result)) {
        const video = document.createElement('video');
        video.className = 'iig-generated-video';
        video.src = result.dataUrl; video.controls = true; video.autoplay = true; video.loop = true; video.muted = true; video.playsInline = true;
        video.title = `Style: ${tag.style}\nPrompt: ${tag.prompt}`;
        if (result.posterDataUrl) video.poster = result.posterDataUrl;
        return video;
    }
    const img = document.createElement('img');
    img.className = 'iig-generated-image';
    img.src = result; img.alt = tag.prompt; img.title = `Style: ${tag.style}\nPrompt: ${tag.prompt}`;
    return img;
}

// Replace an image src everywhere it's stored in a message object.
// SillyTavern keeps src in multiple places (mes, display_text, extblocks, swipe_info, swipes),
// and any one of them being stale will cause a regenerated image to revert on re-render.
function replaceImageSrcEverywhere(message, oldSrc, newSrc) {
    if (!message || !oldSrc || !newSrc || oldSrc === newSrc) return false;
    let changed = false;
    const rep = (str) => {
        if (typeof str !== 'string' || !str.includes(oldSrc)) return str;
        changed = true;
        return str.split(oldSrc).join(newSrc);
    };
    if (typeof message.mes === 'string') message.mes = rep(message.mes);
    if (message.extra) {
        if (typeof message.extra.display_text === 'string') message.extra.display_text = rep(message.extra.display_text);
        if (typeof message.extra.extblocks === 'string') message.extra.extblocks = rep(message.extra.extblocks);
    }
    // Patch ALL swipes, not just current. If user clicks swipe ↔ abort ↔ swipe-back,
    // ST sometimes restores message.mes from a non-current swipe (or extra storage)
    // that still holds the pre-regen src. No-op when a swipe doesn't contain oldSrc
    // (different content) — safe to iterate.
    if (Array.isArray(message.swipes)) {
        for (let i = 0; i < message.swipes.length; i++) {
            if (typeof message.swipes[i] === 'string') message.swipes[i] = rep(message.swipes[i]);
        }
    }
    if (Array.isArray(message.swipe_info)) {
        for (let i = 0; i < message.swipe_info.length; i++) {
            const si = message.swipe_info[i];
            if (si?.extra) {
                if (typeof si.extra.display_text === 'string') si.extra.display_text = rep(si.extra.display_text);
                if (typeof si.extra.extblocks === 'string') si.extra.extblocks = rep(si.extra.extblocks);
            }
        }
    }
    return changed;
}

// ── Src remap: self-healing for resurrected stale image paths ──
// ST stores message text in multiple places (mes, display_text, extblocks,
// swipes, swipe_info) and edit/swipe/reload can re-render from ANY of them.
// We patch all the stores we know about on regen, but third-party regex
// scripts and presets can keep their own copies we can't reach. Instead of
// chasing every store, remember every regen as oldSrc→newSrc in localStorage
// and FIX THE DOM (and the message stores) whenever a stale src resurfaces.
const IIG_SRC_REMAP_KEY = 'slay_iig_src_remap_v1';
// 1000, not 200: entries evicted FIFO — a heavy regen user crossing the cap
// loses self-heal for their oldest chats. ~150 bytes/entry → worst case
// ~150KB of localStorage, acceptable.
const IIG_SRC_REMAP_MAX = 1000;

// Entries expire, and the parsed map is cached. Before: nothing ever removed a
// mapping — a rename recorded a year ago in a since-deleted chat still applied
// to anything with a matching path — and resolveSrcRemap re-parsed the whole
// blob (up to ~150 KB) once per image on every chat load.
const IIG_SRC_REMAP_TTL_MS = 30 * 24 * 60 * 60 * 1000;   // 30 days
let _srcRemapCache = null;

function loadSrcRemap() {
    if (_srcRemapCache) return _srcRemapCache;
    try {
        const raw = JSON.parse(localStorage.getItem(IIG_SRC_REMAP_KEY) || '{}') || {};
        const now = Date.now();
        const fresh = {};
        let dropped = 0;
        for (const [k, v] of Object.entries(raw)) {
            // Legacy entries are bare strings with no timestamp — keep them once,
            // stamped as of now, so nobody loses working self-heal on upgrade.
            if (typeof v === 'string') { fresh[k] = { to: v, at: now }; continue; }
            if (v && typeof v.to === 'string' && (now - (v.at || 0)) < IIG_SRC_REMAP_TTL_MS) fresh[k] = v;
            else dropped++;
        }
        if (dropped) iigLog('INFO', `src remap: dropped ${dropped} expired entr${dropped === 1 ? 'y' : 'ies'}`);
        _srcRemapCache = fresh;
        return fresh;
    } catch (e) { _srcRemapCache = {}; return _srcRemapCache; }
}

function recordSrcRemap(oldSrc, newSrc) {
    // Only map real generated files. error.svg / [IMG:GEN] are shared
    // placeholders — mapping those would redirect EVERY error to one image.
    if (!oldSrc || !newSrc || oldSrc === newSrc) return;
    if (!oldSrc.includes('/user/images/') || !newSrc.includes('/user/images/')) return;
    try {
        const map = loadSrcRemap();
        const now = Date.now();
        // Collapse chains: if something already maps to oldSrc, point it at newSrc
        for (const k of Object.keys(map)) { if (map[k]?.to === oldSrc) map[k] = { to: newSrc, at: now }; }
        map[oldSrc] = { to: newSrc, at: now };
        const keys = Object.keys(map);
        if (keys.length > IIG_SRC_REMAP_MAX) {
            for (const k of keys.slice(0, keys.length - IIG_SRC_REMAP_MAX)) delete map[k];
        }
        localStorage.setItem(IIG_SRC_REMAP_KEY, JSON.stringify(map));
    } catch (e) { /* localStorage full/blocked — self-heal just won't persist */ }
}

function resolveSrcRemap(src) {
    if (!src || !src.includes('/user/images/')) return src;
    const map = loadSrcRemap();
    let current = src;
    for (let hops = 0; hops < 10; hops++) {
        const next = map[current]?.to;
        if (!next || next === current) break;
        current = next;
    }
    return current;
}

// Walk all chat images; any whose src was superseded by a regen gets updated
// in-place (DOM) and re-patched into the message stores. Called from the same
// rebind hooks that re-attach regen buttons after edits/swipes/reloads.
function healStaleImageSrcs(root) {
    if (!root) return;
    // Only OUR images. The selector used to match every /user/images/ picture in
    // the chat, so this pass rewrote — and force-saved — images belonging to
    // other extensions and to the user's own manual edits.
    const imgs = root.querySelectorAll('img[data-iig-instruction][src*="/user/images/"]');
    if (!imgs.length) return;
    const ctx = SillyTavern.getContext();
    let healed = 0;
    for (const img of imgs) {
        const cur = img.getAttribute('src') || '';
        const fixed = resolveSrcRemap(cur);
        if (fixed === cur) continue;
        img.setAttribute('src', fixed);
        img.src = fixed;
        healed++;
        const mesEl = img.closest('.mes');
        const messageId = mesEl ? parseInt(mesEl.getAttribute('mesid'), 10) : NaN;
        const message = (Number.isInteger(messageId) && ctx?.chat) ? ctx.chat[messageId] : null;
        if (message) {
            const replaced = replaceImageSrcEverywhere(message, cur, fixed);
            if (replaced) ctx.saveChatDebounced?.();
        }
        iigLog('INFO', `Src heal: ${cur.slice(-40)} -> ${fixed.slice(-40)}`);
    }
    if (healed) iigLog('INFO', `healStaleImageSrcs: fixed ${healed} stale image(s)`);
}

// Find a currently-in-DOM <img> with the same data-iig-instruction as the given element.
// Used after an await, when the original img may have been replaced by a re-render (swipe, edit).
function findLiveImgByInstruction(detachedImg) {
    if (!detachedImg) return null;
    if (detachedImg.isConnected) return detachedImg;
    const instr = detachedImg.getAttribute('data-iig-instruction');
    if (!instr) return null;
    for (const candidate of document.querySelectorAll('img[data-iig-instruction]')) {
        if (candidate.isConnected && candidate.getAttribute('data-iig-instruction') === instr) {
            return candidate;
        }
    }
    return null;
}

// Wrap a generated <img> (with data-iig-instruction) in a container and attach a top-left regen button.
// Idempotent — safe to call multiple times on the same img. Works for newly-generated images AND
// already-rendered ones (e.g. after page reload, chat swipe).
function attachRegenButton(imgEl) {
    if (!imgEl || imgEl.tagName !== 'IMG') return;
    if (imgEl.dataset.iigRegenBound === '1') return;
    const instr = imgEl.getAttribute('data-iig-instruction');
    if (!instr) return;
    if (!imgEl.parentNode) return;
    // Never wrap images that are part of an error-placeholder UI (they already carry their own retry button)
    if (imgEl.classList.contains('iig-error-image') || imgEl.closest('.iig-error-placeholder')) return;

    // Wrap img in a span so we can position the button absolutely relative to it
    const wrap = document.createElement('span');
    wrap.className = 'iig-img-wrap';
    imgEl.parentNode.insertBefore(wrap, imgEl);
    wrap.appendChild(imgEl);

    const btn = document.createElement('button');
    btn.className = 'iig-regen-btn';
    btn.type = 'button';
    btn.title = 'Перегенерировать';
    btn.innerHTML = '<i class="fa-solid fa-rotate"></i>';
    btn.addEventListener('click', async (e) => {
        e.stopPropagation(); e.preventDefault();
        if (!getSettings().enabled) { toastr.info('Генерация выключена в настройках SLAY Images', 'SLAY Images'); return; }
        if (btn.classList.contains('iig-regen-busy')) return;
        btn.classList.add('iig-regen-busy');
        const icon = btn.querySelector('i');
        const origIconClass = icon.className;
        icon.className = 'fa-solid fa-spinner iig-spin-anim';

        // Parse the stored data-iig-instruction — robust against HTML-escaped quotes
        let data;
        try {
            const decoded = String(imgEl.getAttribute('data-iig-instruction') || '')
                .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
                .replace(/&#39;/g, "'").replace(/&#34;/g, '"').replace(/&amp;/g, '&');
            try { data = JSON.parse(decoded); }
            catch (_) { data = JSON.parse(decoded.replace(/'/g, '"')); }
        } catch (err) {
            toastr.error('Не удалось распарсить параметры картинки', 'SLAY Images');
            icon.className = origIconClass; btn.classList.remove('iig-regen-busy'); return;
        }

        const mesEl = imgEl.closest('.mes');
        const messageId = mesEl ? parseInt(mesEl.getAttribute('mesid'), 10) : undefined;
        const ctx = SillyTavern.getContext();
        const message = (Number.isInteger(messageId) && ctx?.chat) ? ctx.chat[messageId] : null;

        // Capture original state. Use getAttribute('src') — the relative path as stored in
        // message.mes / display_text / extblocks. imgEl.src would give us an absolute URL
        // which won't match the relative one in the message text, so replaceAll would no-op.
        let liveImg = imgEl;
        const origSrcAttr = imgEl.getAttribute('src') || '';
        // Note: we don't dim the image via inline opacity anymore. The overlay's backdrop
        // (rgba(8,8,14,0.55) + blur) provides enough visual feedback that regen is in progress,
        // and avoids a class of edge-case bugs where inline opacity stayed sticky after a DOM
        // re-render (swipe during regen, ST message re-render, etc.).

        // Floating overlay with spinner + status + live timer, placed inside the img wrap
        // above the image. Matches the loading-placeholder timer format for consistency.
        const overlay = document.createElement('div');
        overlay.className = 'iig-regen-overlay';
        overlay.innerHTML = `
            <div class="iig-spinner-wrap"><div class="iig-spinner"></div></div>
            <div class="iig-status">
                <span class="iig-status-label">Перегенерация...</span>
                <span class="iig-status-timer"></span>
            </div>
        `;
        wrap.appendChild(overlay);
        // iOS Safari <15.4 has no :has() support, so also toggle an explicit class on the wrap
        // (used by the overflow-hidden fallback in style.css to clip hover-scale on the img).
        wrap.classList.add('iig-regen-active');
        const overlayLabel = overlay.querySelector('.iig-status-label');
        const overlayTimer = overlay.querySelector('.iig-status-timer');
        const regenStart = Date.now();
        const regenTSec = FETCH_TIMEOUT / 1000;
        overlayTimer.textContent = `(0:00 / ${Math.floor(regenTSec / 60)}:00${IS_IOS ? ', iOS' : ''})`;
        const regenTimerId = setInterval(() => {
            if (!overlayTimer.isConnected) { clearInterval(regenTimerId); return; }
            const el = Math.floor((Date.now() - regenStart) / 1000);
            if (el >= regenTSec) { overlayTimer.textContent = '(Timeout)'; clearInterval(regenTimerId); return; }
            const m = Math.floor(el / 60), s = el % 60;
            overlayTimer.textContent = `(${m}:${String(s).padStart(2, '0')} / ${Math.floor(regenTSec / 60)}:00${IS_IOS ? ', iOS' : ''})`;
        }, 1000);

        let newImagePath = null;
        let errorMsg = null;
        try {
            const result = await generateImageWithRetry(data.prompt, data.style, (s) => { if (overlayLabel?.isConnected) overlayLabel.textContent = s; }, {
                aspectRatio: data.aspect_ratio, imageSize: data.image_size,
                quality: data.quality, preset: data.preset, messageId,
            });
            if (overlayLabel?.isConnected) overlayLabel.textContent = 'Сохранение...';
            if (overlayTimer?.isConnected) overlayTimer.textContent = '';
            newImagePath = isGeneratedVideoResult(result)
                ? await saveNaisteraMediaToFile(result.dataUrl, 'video')
                : await saveImageToFile(result);
        } catch (err) {
            errorMsg = err?.message || String(err);
            iigLog('ERROR', `Regen failed: ${errorMsg}`);
        }
        clearInterval(regenTimerId);
        overlay.remove();
        wrap.classList.remove('iig-regen-active');

        // The img may have been replaced in DOM by a swipe/edit during the await.
        // Always re-resolve to a live element before touching .src.
        const resolved = findLiveImgByInstruction(liveImg);
        if (resolved) liveImg = resolved;

        try {
            if (newImagePath) {
                // Success path — apply new src and persist everywhere
                liveImg.setAttribute('src', newImagePath);
                liveImg.src = newImagePath;
                // Remember the supersession PERSISTENTLY. Even if some store we
                // can't reach (preset regex copies, display_text rebuilt by other
                // extensions) resurrects the old src on a future re-render, the
                // heal pass will swap it back to this new one on sight.
                recordSrcRemap(origSrcAttr, newImagePath);
                if (message && origSrcAttr) {
                    const replaced = replaceImageSrcEverywhere(message, origSrcAttr, newImagePath);
                    if (replaced) {
                        // FORCE save (not debounced). If the user reloads the chat
                        // before the debounce fires (~5s), message.mes still has
                        // the OLD src and the previous image silently re-appears.
                        // Same bug fixed in retryFailedGeneration in 4.1.6 — this
                        // is the regular-regen-success twin we missed.
                        try { await ctx.saveChat?.(); } catch (e) { ctx.saveChatDebounced?.(); }
                    } else iigLog('WARN', `Regen: could not find origSrc "${origSrcAttr.slice(0, 60)}" in message fields — src updated in DOM only, may revert on reload`);
                }
                toastr.success('Картинка перегенерирована', 'SLAY Images', { timeOut: 2000 });
            } else {
                // Error path — restore original src so the user doesn't get stuck on a broken frame
                if (origSrcAttr && liveImg.getAttribute('src') !== origSrcAttr) {
                    liveImg.setAttribute('src', origSrcAttr);
                    liveImg.src = origSrcAttr;
                }
                toastr.error(`Перегенерация упала: ${errorMsg || 'неизвестная ошибка'}`, 'SLAY Images');
            }
        } finally {
            // Safety net: clear any leftover inline opacity on ANY img with the same
            // data-iig-instruction in DOM. Covers DOM re-renders / swipes / duplicate
            // copies that may have inherited a sticky "0.35" from older extension versions.
            try {
                const instrVal = imgEl.getAttribute('data-iig-instruction');
                if (instrVal) {
                    for (const candidate of document.querySelectorAll('img[data-iig-instruction]')) {
                        if (candidate.getAttribute('data-iig-instruction') === instrVal) {
                            candidate.style.opacity = '';
                        }
                    }
                }
                imgEl.style.opacity = '';
                if (liveImg !== imgEl) liveImg.style.opacity = '';
            } catch (e) { /* never block finalization */ }
            icon.className = origIconClass;
            btn.classList.remove('iig-regen-busy');
        }
    });
    wrap.appendChild(btn);
    imgEl.dataset.iigRegenBound = '1';
}

// Scan a message element (or root) for generated images and attach regen buttons to them.
// Safe to call on already-bound images (attachRegenButton is idempotent).
// Remove every control this extension injected into the chat. Called when the
// user switches generation off, so the UI matches the setting immediately
// instead of only after a reload — and so our buttons stop sitting on top of
// another extension's images.
function iigStripOurUi() {
    for (const b of document.querySelectorAll('#chat .iig-regen-btn, #chat .iig-regenerate-btn')) b.remove();
    for (const img of document.querySelectorAll('#chat img[data-iig-instruction]')) delete img.dataset.iigRegenBound;
}

function attachRegenButtonsInRoot(root, { rehydratePending = false } = {}) {
    if (!root) return;
    // "Off" has to mean off. This pass heals srcs, rewrites error placeholders
    // and attaches regen buttons — and it used to run even with generation
    // disabled. Because every extension in this family uses the same
    // data-iig-instruction tag format, a disabled SLAY was grabbing ANOTHER
    // extension's images: attaching its buttons to them, replacing their error
    // cards with its own, and rewriting their srcs into the saved chat. Clicking
    // any of those buttons then generated through SLAY's API while SLAY was off.
    if (!getSettings().enabled) return;

    // ZEROTH: self-heal any resurrected stale srcs (superseded by a regen).
    // Runs before everything else so the rest of this pass — and the user —
    // sees the current image, not whatever stale store ST re-rendered from.
    try { healStaleImageSrcs(root); } catch (e) { iigLog('WARN', 'healStaleImageSrcs failed:', e.message); }

    // FIRST: rehydrate any stale error-img remnants. They may be <img src="error.svg">
    // OR the same img wrapped into a <span class="iig-img-wrap"> (if some earlier pass
    // gave them a regen overlay from an older version). Also catch broken-img fallbacks
    // (src like /error.svg that 404'd).
    // Deliberately NOT requiring [data-iig-instruction]: a tag whose instruction
    // attribute got mangled (an apostrophe in the prompt truncates it) would
    // otherwise stay a broken-image icon forever, which is exactly what users
    // reported as "my pictures disappeared". Without the instruction the retry
    // button can't refire, but the user still gets a readable error card instead
    // of a dead square. 'error.svg' and the legacy markers are matched too, so
    // chats already damaged by older builds heal on their next render.
    const errorSelectors = [
        'img.iig-error-image',
        'img[data-iig-error]',
        'img[src*="error.svg"]',
        'img[src*="[IMG:ERROR"]',
    ].join(', ');
    for (const stale of root.querySelectorAll(errorSelectors)) {
        const instr = stale.getAttribute('data-iig-instruction') || '';
        const errorEl = createErrorPlaceholder(stale.dataset.tagId || `iig-reload-${Date.now()}`, 'Картинка не была сгенерирована', { fullMatch: `data-iig-instruction='${instr}'` });
        // If the stale img is inside an iig-img-wrap (regen overlay from older build),
        // replace the WHOLE wrap, not just the img — otherwise the overlay circle stays visible.
        const wrap = stale.closest('.iig-img-wrap');
        (wrap || stale).replaceWith(errorEl);
    }

    // SECOND: revive tags whose generation never finished. A phone that discards
    // a backgrounded tab (or ST restarting) kills the in-flight request while
    // message.mes still holds the unfilled [IMG:GEN] tag — nothing rewrote it,
    // so on the next load the user got no image, no error and no button at all,
    // just a gap where a picture should be. Only on load / chat-switch passes:
    // during an active generation the placeholder is a <div>, not one of these,
    // but the flag keeps us from ever racing a live request.
    if (rehydratePending) {
        const pending = root.querySelectorAll('img[data-iig-instruction][src*="[IMG:GEN"], img[data-iig-instruction][src=""]');
        for (const el of pending) {
            const mesEl = el.closest('.mes');
            const mid = mesEl ? parseInt(mesEl.getAttribute('mesid'), 10) : NaN;
            if (Number.isInteger(mid) && processingMessages.has(mid)) continue;
            const instr = el.getAttribute('data-iig-instruction') || '';
            const errorEl = createErrorPlaceholder(`iig-interrupted-${Date.now()}`, 'Генерация была прервана — вкладка закрылась или связь оборвалась', { fullMatch: `data-iig-instruction='${instr}'` });
            (el.closest('.iig-img-wrap') || el).replaceWith(errorEl);
        }
    }

    // THEN: attach regen button to normal generated images. Skip anything error-ish.
    const imgs = root.querySelectorAll('img.iig-generated-image[data-iig-instruction], img[data-iig-instruction]');
    for (const img of imgs) {
        if (img.classList.contains('iig-error-image')) continue;
        if (img.closest('.iig-error-placeholder')) continue;
        attachRegenButton(img);
    }
}

function buildPersistedVideoTag(templateHtml, persistedSrc, posterSrc = '') {
    let html = String(templateHtml || '').trim()
        .replace(/^<(?:img|video)\b/i, '<video controls autoplay loop muted playsinline')
        .replace(/<\/video>\s*$/i, '').replace(/\/?>\s*$/i, '')
        .replace(/src\s*=\s*(['"])[^'"]*\1/i, `src="${persistedSrc}"`);
    html = html.replace(/\s+poster\s*=\s*(['"])[\s\S]*?\1/i, '');
    if (posterSrc) html = html.replace(/^<video\b/i, `<video poster="${sanitizeForHtml(posterSrc)}"`);
    return `${html}></video>`;
}

// ST's render/save pipeline can entity-encode non-ASCII inside the data-iig-instruction
// attribute, so the prompt arrives here as literal "&#1040;&#1085;..." instead of
// "Анна". Name-matching then searches for real Cyrillic and never finds it → refs
// silently skipped. ASCII (English names) is never entity-encoded, which is exactly
// why only Russian names broke. Only touches &#...; patterns — safe for everything
// else. Bonus: the model also receives clean Cyrillic instead of entity text.
function decodeNumericEntities(str) {
    if (typeof str !== 'string' || str.indexOf('&#') === -1) return str;
    return str
        .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch (e) { return m; } })
        .replace(/&#(\d+);/g, (m, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch (e) { return m; } });
}

// ╔═════════════════════════════════════════════════════════════╗
// ║  generateImageWithRetry — THE CRITICAL MERGE POINT          ║
// ╚═════════════════════════════════════════════════════════════╝

async function generateImageWithRetry(prompt, style, onStatusUpdate, options = {}) {
    validateSettings();
    const settings = getSettings();
    // Normalize the prompt BEFORE name-matching and before it's sent to the API.
    // This is the single chokepoint where charInPrompt/userInPrompt are computed
    // and where the request body is built, so decoding here fixes both.
    {
        const _before = prompt;
        prompt = decodeNumericEntities(prompt);
        if (prompt !== _before) {
            const m = (_before.match(/&#x?[0-9a-fA-F]+;/g) || []).slice(0, 6).join(' ');
            iigLog('INFO', `decoded numeric HTML entities in prompt (sample: ${m}) — Cyrillic names should now match`);
        }
    }
    // Override with user-selected SLAY style if configured
    if (settings.slayStyle) {
        style = settings.slayStyle;
    }
    const maxRetries = settings.maxRetries;
    const baseDelay = settings.retryDelay;

    const referenceImages = [];
    const referenceDataUrls = [];
    const refLabels = [];
    const refNames = [];
    const swS = SillyTavern.getContext().extensionSettings.slay_wardrobe || {};

    // ── Determine which characters are mentioned in the prompt (used for refs AND descriptions) ──
    // Name field can contain multiple aliases separated by comma/semicolon/pipe/slash/space
    // (e.g. "Ева, Eve, Eva, Ivy, Иви") — see parseNameTokens(). Matching any alias = mentioned.
    const refs = getCurrentCharacterRefs();
    const charDisplayName = getDefaultCharRefName(refs);
    const userDisplayName = getDefaultUserRefName(refs);
    const lowerPrompt = prompt.toLowerCase();
    const charInPrompt = nameIsInPrompt(charDisplayName, lowerPrompt);
    const userInPrompt = nameIsInPrompt(userDisplayName, lowerPrompt);
    // Refs ship only when their owner is explicitly named in the image prompt. This restores
    // the pre-PR behaviour: char face/outfit gated by charInPrompt, user face/outfit by userInPrompt.
    // Matched NPCs already use the same name-matching path via matchNpcReferences.
    const shouldSendCharReference = settings.sendCharAvatar && charInPrompt;
    const shouldSendUserReference = settings.sendUserAvatar && userInPrompt;
    iigLog('INFO', `Prompt mentions: char "${charDisplayName}"=${charInPrompt}, user "${userDisplayName}"=${userInPrompt}`);
    if (settings.sendCharAvatar && !charInPrompt) iigLog('INFO', `Char ref skipped — "${charDisplayName}" not found in image prompt`);
    if (settings.sendUserAvatar && !userInPrompt) iigLog('INFO', `User ref skipped — "${userDisplayName}" not found in image prompt`);
    if (!settings.sendCharAvatar) iigLog('INFO', 'Char ref disabled in settings (sendCharAvatar=false)');
    if (!settings.sendUserAvatar) iigLog('INFO', 'User ref disabled in settings (sendUserAvatar=false)');

    // ── Multimodal refs (base64 + labels) for Gemini AND OpenAI-compatible chat.completions ──
    // Custom + images/generations body has no slot for refs — don't waste time
    // downloading/encoding avatars that generateImageOpenAI would then discard.
    const _skipRefs = settings.apiType === 'custom' && (settings.customBodyFormat || 'chat') === 'images';
    if (settings.apiType !== 'naistera' && !_skipRefs) {
        const canPush = () => referenceImages.length < MAX_GENERATION_REFERENCE_IMAGES;
        const pushRef = (image, label, name = '') => {
            if (!image || !canPush()) return false;
            referenceImages.push(image);
            refLabels.push(label);
            refNames.push(name);
            return true;
        };

        // 1. Character avatar — only if char is mentioned
        if (canPush() && shouldSendCharReference) {
            const charReference = await getPreferredCharacterReferenceBase64(refs, settings);
            pushRef(charReference, 'char_face', charDisplayName);
        }

        // 2. User avatar — only if user is mentioned
        if (canPush() && shouldSendUserReference) {
            const userReference = await getPreferredUserReferenceBase64(refs, settings);
            pushRef(userReference, 'user_face', userDisplayName);
        }

        // 3. Wardrobe outfits — only for the character(s) mentioned in the prompt
        if (window.slayWardrobe?.isReady()) {
            if (canPush() && charInPrompt && swS.sendOutfitImageBot !== false) {
                let pushed = false;
                const botB64 = await window.slayWardrobe.getActiveOutfitBase64('bot');
                if (botB64) pushed = pushRef(botB64, 'char_outfit', charDisplayName);
                if (!pushed && canPush() && swS.experimentalCollage && window.slayWardrobe?.getCollageBase64) {
                    const collageB64 = await window.slayWardrobe.getCollageBase64('bot');
                    if (pushRef(collageB64, 'char_outfit', charDisplayName)) iigLog('INFO', 'Collage sent for char');
                }
            }
            if (canPush() && userInPrompt && swS.sendOutfitImageUser !== false) {
                let pushed = false;
                const userB64 = await window.slayWardrobe.getActiveOutfitBase64('user');
                if (userB64) pushed = pushRef(userB64, 'user_outfit', userDisplayName);
                if (!pushed && canPush() && swS.experimentalCollage && window.slayWardrobe?.getCollageBase64) {
                    const collageB64 = await window.slayWardrobe.getCollageBase64('user');
                    if (pushRef(collageB64, 'user_outfit', userDisplayName)) iigLog('INFO', 'Collage sent for user');
                }
            }
        }

        // 4. Matched NPCs
        const matchedNpcs = matchNpcReferences(prompt, refs.npcReferences || []);
        for (const npc of matchedNpcs) {
            if (!canPush()) break;
            const b64 = npc.imagePath ? await loadRefImageAsBase64(npc.imagePath) : (npc.imageBase64 || npc.imageData);
            if (pushRef(b64, 'npc_matched', npc.name || 'NPC')) iigLog('INFO', `NPC matched: ${npc.name}`);
        }
        // 5. Context images
        if (settings.imageContextEnabled) {
            const contextCount = normalizeImageContextCount(settings.imageContextCount);
            const contextRefs = await collectPreviousContextReferences(options.messageId, 'base64', contextCount);
            for (const cr of contextRefs) {
                if (!pushRef(cr, 'context', '')) break;
            }
        }
    }

    // ── Naistera: data URL refs ──
    // Priority order: char face → user face → wardrobe → NPC faces → context
    const naisteraRefLabels = [];
    const currentNaisteraModelForRefs = normalizeNaisteraModel(options.model || settings.naisteraModel);
    const supportsNaisteraRefs = currentNaisteraModelForRefs === 'grok' || currentNaisteraModelForRefs === 'nano banana';
    if (settings.apiType === 'naistera' && supportsNaisteraRefs) {
        const getDataUrl = async (ref) => {
            if (ref?.imagePath) { const b64 = await loadRefImageAsBase64(ref.imagePath); if (b64) return 'data:image/jpeg;base64,' + b64; }
            const b64 = ref?.imageBase64 || ref?.imageData;
            return b64 ? 'data:image/jpeg;base64,' + b64 : null;
        };
        const canPush = () => referenceDataUrls.length < MAX_GENERATION_REFERENCE_IMAGES;
        const pushRef = (url, label) => {
            if (!url || !canPush()) return false;
            referenceDataUrls.push(url);
            naisteraRefLabels.push(label);
            return true;
        };
        // 1. Character avatar — only if char is mentioned
        if (canPush() && shouldSendCharReference) {
            const u = await getPreferredCharacterReferenceDataUrl(refs, settings);
            if (u) pushRef(u, `${charDisplayName} (character)`);
        }
        // 2. User avatar — only if user is mentioned
        if (canPush() && shouldSendUserReference) {
            const u = await getPreferredUserReferenceDataUrl(refs, settings);
            if (u) pushRef(u, `${userDisplayName} (user)`);
        }
        // 3. Wardrobe outfits — only for the character(s) mentioned in the prompt
        if (window.slayWardrobe?.isReady()) {
            if (canPush() && charInPrompt && swS.sendOutfitImageBot !== false) {
                let pushed = false;
                const botB64 = await window.slayWardrobe.getActiveOutfitBase64('bot');
                if (botB64) pushed = pushRef(`data:image/png;base64,${botB64}`, `${charDisplayName} outfit`);
                if (!pushed && canPush() && swS.experimentalCollage && window.slayWardrobe?.getCollageBase64) {
                    const collageB64 = await window.slayWardrobe.getCollageBase64('bot');
                    if (pushRef(collageB64 ? `data:image/png;base64,${collageB64}` : null, `${charDisplayName} outfit`)) iigLog('INFO', 'Collage sent for char');
                }
            }
            if (canPush() && userInPrompt && swS.sendOutfitImageUser !== false) {
                let pushed = false;
                const userB64 = await window.slayWardrobe.getActiveOutfitBase64('user');
                if (userB64) pushed = pushRef(`data:image/png;base64,${userB64}`, `${userDisplayName} outfit`);
                if (!pushed && canPush() && swS.experimentalCollage && window.slayWardrobe?.getCollageBase64) {
                    const collageB64 = await window.slayWardrobe.getCollageBase64('user');
                    if (pushRef(collageB64 ? `data:image/png;base64,${collageB64}` : null, `${userDisplayName} outfit`)) iigLog('INFO', 'Collage sent for user');
                }
            }
        }
        // 4. NPC faces (matched against prompt)
        const matchedNpcs = matchNpcReferences(prompt, refs.npcReferences || []);
        for (const npc of matchedNpcs) {
            if (!canPush()) break;
            const url = await getDataUrl(npc);
            if (url) { pushRef(url, `${npc.name} (NPC)`); iigLog('INFO', `NPC (naistera): ${npc.name}`); }
        }
        // 5. Context refs (previous images)
        if (settings.imageContextEnabled) {
            const contextRefs = await collectPreviousContextReferences(options.messageId, 'dataUrl', normalizeImageContextCount(settings.imageContextCount));
            for (const cr of contextRefs) {
                if (!canPush()) break;
                pushRef(cr, 'previous scene');
            }
        }
    }

    // (OpenAI refs now collected in the unified multimodal block above)

    // Trim
    if (referenceImages.length > MAX_GENERATION_REFERENCE_IMAGES) { referenceImages.length = MAX_GENERATION_REFERENCE_IMAGES; refLabels.length = MAX_GENERATION_REFERENCE_IMAGES; refNames.length = MAX_GENERATION_REFERENCE_IMAGES; }
    if (referenceDataUrls.length > MAX_GENERATION_REFERENCE_IMAGES) { referenceDataUrls.length = MAX_GENERATION_REFERENCE_IMAGES; naisteraRefLabels.length = MAX_GENERATION_REFERENCE_IMAGES; }

    // Video test mode
    const enableVideoTest = settings.apiType === 'naistera'
        && settings.naisteraVideoTest
        && shouldUseNaisteraVideoTest(options.model || settings.naisteraModel)
        && shouldTriggerNaisteraVideoForMessage(options.messageId, settings.naisteraVideoEveryN);

    // ── Inject wardrobe outfit descriptions into prompt (only if enabled) ──
    if (swS.sendOutfitDescription !== false && window.slayWardrobe?.isReady()) {
        const botDesc = window.slayWardrobe.getActiveOutfitDescription('bot');
        const userDesc = window.slayWardrobe.getActiveOutfitDescription('user');
        iigLog('INFO', `Wardrobe bot desc (${botDesc.length} chars): ${botDesc.substring(0, 150)}`);
        iigLog('INFO', `Wardrobe user desc (${userDesc.length} chars): ${userDesc.substring(0, 150)}`);
        const wardrobeParts = [];
        if (botDesc && charInPrompt) wardrobeParts.push(`[Clothing reference only, avoid copying the pose] [Character's current outfit: ${botDesc}]`);
        if (userDesc && userInPrompt) wardrobeParts.push(`[Clothing reference only, avoid copying the pose] [User's current outfit: ${userDesc}]`);
        if (wardrobeParts.length > 0) {
            prompt = `${wardrobeParts.join(' ')}\n${prompt}`;
            iigLog('INFO', `Wardrobe v4 descriptions injected: ${wardrobeParts.join(' | ').substring(0, 200)}`);
        }
    }

    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            onStatusUpdate?.(`Генерация${attempt > 0 ? ` (повтор ${attempt}/${maxRetries})` : ''}...`);
            let generated;
            if (settings.apiType === 'naistera') {
                generated = await generateImageNaistera(prompt, style, { ...options, referenceImages: referenceDataUrls, referenceLabels: naisteraRefLabels, videoTestMode: enableVideoTest, videoEveryN: settings.naisteraVideoEveryN });
            } else if (settings.apiType === 'gemini') {
                // Strictly user's choice — don't auto-route via isGeminiModel().
                // Some OpenAI-compat routers (llmrouter, openrouter) host Gemini
                // models behind /v1/chat/completions, NOT /v1beta. Overriding by
                // model name 404s on those routers despite the user explicitly
                // picking OpenAI-compatible.
                generated = await generateImageGemini(prompt, style, referenceImages, { ...options, refLabels, refNames });
            } else {
                generated = await generateImageOpenAI(prompt, style, referenceImages, { ...options, refLabels, refNames });
            }

            if (isGeneratedVideoResult(generated)) {
                iigLog('INFO', `Result: video, mime=${generated.contentType}`);
            } else if (typeof generated === 'string' && generated.startsWith('data:')) {
                try { const p = parseImageDataUrl(generated); iigLog('INFO', `Result: mime=${p.mimeType} b64len=${p.base64Data.length}`); } catch (e) { }
            }
            return generated;
        } catch (error) {
            lastError = error;
            console.error(`[IIG] Attempt ${attempt + 1} failed:`, error);
            // Case-insensitive, and matching what browsers ACTUALLY say. The old
            // test looked for 'timeout'/'network' and matched none of the real
            // connection failures: Android Chrome throws "Failed to fetch", iOS
            // Safari "Load failed", our own iOS path "Network error (iOS)" (capital
            // N) and "Request timed out ..." ("timed out", not "timeout"). So on
            // mobile — the one place connections actually drop — a user who had
            // deliberately turned retries on never got a single one.
            // NOTE: this only makes the user's own maxRetries setting work. We do
            // NOT retry beyond it: a retry is a paid request, and on a timeout the
            // server may well have generated and billed the image already.
            const m = String(error.message || '').toLowerCase();
            const isRetryable = /\b(429|500|502|503|504)\b/.test(m)
                || m.includes('failed to fetch') || m.includes('load failed')
                || m.includes('network') || m.includes('networkerror')
                || m.includes('timed out') || m.includes('timeout')
                || error.name === 'AbortError';
            if (!isRetryable || attempt === maxRetries) break;
            const delay = baseDelay * Math.pow(2, attempt);
            onStatusUpdate?.(`Повтор через ${delay / 1000}с...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw lastError;
}

// ── Tag parsing (from sillyimages-master, supports video tags) ──
async function parseImageTags(text, options = {}) {
    const { checkExistence = false, forceAll = false } = options;
    const tags = [];

    // NEW FORMAT
    const imgTagMarker = 'data-iig-instruction=';
    let searchPos = 0;
    while (true) {
        const markerPos = text.indexOf(imgTagMarker, searchPos);
        if (markerPos === -1) break;
        const imgStart = text.lastIndexOf('<img', markerPos);
        const videoStart = text.lastIndexOf('<video', markerPos);
        const mediaStart = Math.max(imgStart, videoStart);
        const isVideoTag = mediaStart === videoStart && videoStart !== -1;
        const tagName = isVideoTag ? 'video' : 'img';
        if (mediaStart === -1 || markerPos - mediaStart > 800) { searchPos = markerPos + 1; continue; }

        const afterMarker = markerPos + imgTagMarker.length;
        let jsonStart = text.indexOf('{', afterMarker);
        if (jsonStart === -1 || jsonStart > afterMarker + 10) { searchPos = markerPos + 1; continue; }

        let braceCount = 0, jsonEnd = -1, inString = false, escapeNext = false;
        for (let i = jsonStart; i < text.length; i++) {
            const char = text[i];
            if (escapeNext) { escapeNext = false; continue; }
            if (char === '\\' && inString) { escapeNext = true; continue; }
            if (char === '"') { inString = !inString; continue; }
            if (!inString) { if (char === '{') braceCount++; else if (char === '}') { braceCount--; if (braceCount === 0) { jsonEnd = i + 1; break; } } }
        }
        if (jsonEnd === -1) { searchPos = markerPos + 1; continue; }

        let mediaEnd = -1;
        if (isVideoTag) { mediaEnd = text.indexOf('</video>', jsonEnd); if (mediaEnd !== -1) mediaEnd += '</video>'.length; }
        else { mediaEnd = text.indexOf('>', jsonEnd); if (mediaEnd !== -1) mediaEnd += 1; }
        if (mediaEnd === -1) { searchPos = markerPos + 1; continue; }

        const fullImgTag = text.substring(mediaStart, mediaEnd);
        const instructionJson = text.substring(jsonStart, jsonEnd);
        const srcMatch = fullImgTag.match(/src\s*=\s*["']?([^"'\s>]+)/i);
        const srcValue = srcMatch ? srcMatch[1] : '';

        let needsGeneration = false;
        const hasMarker = srcValue.includes('[IMG:GEN]') || srcValue.includes('[IMG:');
        const hasErrorImage = srcValue.includes('error.svg');
        const hasPath = srcValue && srcValue.startsWith('/') && srcValue.length > 5;

        if (hasErrorImage && !forceAll) { searchPos = mediaEnd; continue; }
        if (forceAll) needsGeneration = true;
        else if (hasMarker || !srcValue) needsGeneration = true;
        else if (hasPath && checkExistence) {
            const exists = await checkFileExists(srcValue);
            if (!exists) { iigLog('WARN', `File not found (hallucination?): ${srcValue}`); needsGeneration = true; }
        } else if (hasPath) { searchPos = mediaEnd; continue; }
        if (!needsGeneration) { searchPos = mediaEnd; continue; }

        try {
            let normalizedJson = instructionJson.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'").replace(/&#34;/g, '"').replace(/&amp;/g, '&');
            const data = JSON.parse(normalizedJson);
            tags.push({ fullMatch: fullImgTag, index: mediaStart, style: data.style || '', prompt: data.prompt || '', aspectRatio: data.aspect_ratio || data.aspectRatio || null, preset: data.preset || null, imageSize: data.image_size || data.imageSize || null, quality: data.quality || null, isNewFormat: true, mediaTagName: tagName, existingSrc: hasPath ? srcValue : null });
            iigLog('INFO', `Found NEW tag: ${data.prompt?.substring(0, 50)}`);
        } catch (e) { iigLog('WARN', `Parse failed: ${instructionJson.substring(0, 100)}`); }
        searchPos = mediaEnd;
    }

    // LEGACY FORMAT
    const marker = '[IMG:GEN:';
    let searchStart = 0;
    while (true) {
        const markerIndex = text.indexOf(marker, searchStart);
        if (markerIndex === -1) break;
        const jsonStart = markerIndex + marker.length;
        let braceCount = 0, jsonEnd = -1, inString = false, escapeNext = false;
        for (let i = jsonStart; i < text.length; i++) {
            const char = text[i];
            if (escapeNext) { escapeNext = false; continue; }
            if (char === '\\' && inString) { escapeNext = true; continue; }
            if (char === '"') { inString = !inString; continue; }
            if (!inString) { if (char === '{') braceCount++; else if (char === '}') { braceCount--; if (braceCount === 0) { jsonEnd = i + 1; break; } } }
        }
        if (jsonEnd === -1) { searchStart = jsonStart; continue; }
        const jsonStr = text.substring(jsonStart, jsonEnd);
        if (!text.substring(jsonEnd).startsWith(']')) { searchStart = jsonEnd; continue; }
        const tagOnly = text.substring(markerIndex, jsonEnd + 1);
        try {
            const data = JSON.parse(jsonStr.replace(/'/g, '"'));
            tags.push({ fullMatch: tagOnly, index: markerIndex, style: data.style || '', prompt: data.prompt || '', aspectRatio: data.aspect_ratio || data.aspectRatio || null, preset: data.preset || null, imageSize: data.image_size || data.imageSize || null, quality: data.quality || null, isNewFormat: false });
            iigLog('INFO', `Found LEGACY tag: ${data.prompt?.substring(0, 50)}`);
        } catch (e) { iigLog('WARN', `Legacy parse failed: ${jsonStr.substring(0, 100)}`); }
        searchStart = jsonEnd + 1;
    }
    return tags;
}

// Returns TRUE unless the server explicitly says the file is gone.
// A dropped request, a busy server or a suspended tab must NOT read as
// "file missing": the caller reacts to `false` by regenerating the image,
// and a failed regeneration used to overwrite the still-valid path with an
// error marker. That is how a phone-hosted user lost images that were sitting
// on disk the whole time. Uncertainty never earns the right to destroy data.
async function checkFileExists(path) {
    try {
        const r = await fetch(path, { method: 'HEAD' });
        if (r.status === 404 || r.status === 410) return false;   // genuinely gone
        return true;                                              // ok, or unknown → leave alone
    } catch (e) {
        iigLog('WARN', `checkFileExists: request failed for ${String(path).slice(-50)} — assuming the file is fine`);
        return true;
    }
}

// ── Error image path ──
// Persistence marker for a failed generation: a 1×1 transparent GIF, inline.
// Self-contained, so it cannot 404 no matter where the extension folder lives
// or how it is capitalised — unlike the old error.svg path, which getErrorImagePath()
// could never resolve (ST loads extensions via import(), so there is no <script>
// tag to derive a path from; the stylesheet probe matches lowercase 'slay' but
// the folder is "SLAYimages"; and the hardcoded fallback says "SLAYImages").
// Windows hid the bug because its filesystem ignores case — everyone on Linux,
// Termux or an iPhone host got a broken-image icon instead of our error card.
// What the user actually SEES is createErrorPlaceholder(), swapped in by
// attachRegenButtonsInRoot on every render pass; this src only has to persist
// in message.mes and be recognisable later.
const IIG_ERROR_SRC = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// Is this src a real generated file worth protecting — as opposed to a marker,
// a placeholder or an unfilled tag? Used to refuse destructive overwrites.
function iigIsLiveImagePath(src) {
    const s = String(src || '');
    if (!s || s.startsWith('data:') || s.includes('[IMG:') || s.includes('error.svg')) return false;
    return s.startsWith('/') && s.length > 5;
}

// Every src a failed tag may carry, across builds: the current marker, whatever
// this install resolves error.svg to, and the legacy hardcoded guesses. Used
// when a retry succeeds and we need to find the marker to replace.
function iigErrorSrcCandidates() {
    return [IIG_ERROR_SRC, getErrorImagePath(), ...IIG_LEGACY_ERROR_PATHS];
}

const IIG_LEGACY_ERROR_PATHS = [
    '/scripts/extensions/third-party/SLAYImages/error.svg',
    '/scripts/extensions/third-party/SLAYimages/error.svg',
    '/scripts/extensions/third-party/SLAYImages_v4_draft/error.svg',
    '/scripts/extensions/third-party/SLAYImages_v4_collage/error.svg',
    '/scripts/extensions/third-party/notsosillynotsoimages/error.svg',
    '/scripts/extensions/third-party/sillyimages/error.svg',
];

let _cachedErrorImagePath = null;
function getErrorImagePath() {
    if (_cachedErrorImagePath) return _cachedErrorImagePath;
    // Only used to RECOGNISE legacy error tags now — new failures are written
    // with IIG_ERROR_SRC, which needs no path at all. Matching is case-INSENSITIVE:
    // ST names the folder after the repo ("SLAYimages"), which contains no
    // lowercase "slay", so the old case-sensitive probes never matched and every
    // install fell through to a hardcoded guess with the wrong capitalisation.
    // (The <script> probe below can never match either — ST loads extensions via
    // await import(), which creates no script element — but it costs nothing and
    // covers builds that inject a tag.)
    const matchesUs = (p) => {
        const s = p.toLowerCase();
        return s.includes('slay') || s.includes('sillyimages') || s.includes('notsosillynotsoimages') || s.includes('inline_image_gen');
    };
    for (const script of document.querySelectorAll('script[src*="index.js"]')) {
        const src = script.getAttribute('src') || '';
        if (matchesUs(src)) {
            _cachedErrorImagePath = `${src.substring(0, src.lastIndexOf('/'))}/error.svg`;
            return _cachedErrorImagePath;
        }
    }
    for (const link of document.querySelectorAll('link[rel="stylesheet"][href*="style.css"]')) {
        const href = link.getAttribute('href') || '';
        if (matchesUs(href)) {
            _cachedErrorImagePath = `${href.substring(0, href.lastIndexOf('/'))}/error.svg`;
            return _cachedErrorImagePath;
        }
    }
    _cachedErrorImagePath = IIG_LEGACY_ERROR_PATHS[0];
    return _cachedErrorImagePath;
}

// ── Loading / Error placeholders ──
function createLoadingPlaceholder(tagId) {
    const placeholder = document.createElement('div');
    placeholder.className = 'iig-loading-placeholder';
    placeholder.dataset.tagId = tagId;
    // Timer sits inside the status line as a separate span so that a) it can never be hidden
    // behind the status text, and b) status updates (e.g. "Сохранение...") naturally replace it
    // without leaving orphan timer DOM.
    placeholder.innerHTML = `
        <div class="iig-spinner-wrap"><div class="iig-spinner"></div></div>
        <div class="iig-status"><span class="iig-status-label">Генерация картинки...</span> <span class="iig-status-timer"></span></div>
    `;
    const timerEl = placeholder.querySelector('.iig-status-timer');
    const startTime = Date.now();
    const tSec = FETCH_TIMEOUT / 1000;
    placeholder._timerInterval = setInterval(() => {
        if (!timerEl.isConnected) { clearInterval(placeholder._timerInterval); return; }
        const el = Math.floor((Date.now() - startTime) / 1000);
        if (el >= tSec) { timerEl.textContent = "(Timeout)"; clearInterval(placeholder._timerInterval); return; }
        const m = Math.floor(el / 60), s = el % 60;
        timerEl.textContent = `(${m}:${String(s).padStart(2, "0")} / ${Math.floor(tSec / 60)}:00${IS_IOS ? ", iOS" : ""})`;
    }, 1000);
    // Seed with initial value so the user sees the timer immediately (before first tick)
    timerEl.textContent = `(0:00 / ${Math.floor(tSec / 60)}:00${IS_IOS ? ", iOS" : ""})`;
    return placeholder;
}

function createErrorPlaceholder(tagId, errorMessage, tagInfo) {
    // v4.1.5: div-based error placeholder with inline SVG (no dependency on error.svg file which
    // was unreliable when extension path != standard) + built-in "Попробовать снова" button.
    // This replaces the previous <img class="iig-error-image" src="error.svg"> which caused two
    // bugs: (a) broken <img> icon when error.svg 404, (b) attachRegenButton wrapped the
    // zero-width broken image in <span>, making the regen overlay zero-sized.
    const el = document.createElement('div');
    el.className = 'iig-error-placeholder';
    el.dataset.tagId = tagId;
    // Keep instruction on the element so the retry button can parse it, AND so recovery after
    // page reload still has params to regenerate from
    let instructionValue = '';
    if (tagInfo?.fullMatch) {
        const m = tagInfo.fullMatch.match(/data-iig-instruction\s*=\s*(?:(['"]))([\s\S]*?)\1/i) || tagInfo.fullMatch.match(/data-iig-instruction\s*=\s*([{][\s\S]*?[}])(?:\s|>)/i);
        if (m) instructionValue = m[2] || m[1];
    }
    if (instructionValue) el.setAttribute('data-iig-instruction', instructionValue);
    const shortMsg = String(errorMessage || '').slice(0, 140);
    const fullMsg = String(errorMessage || '');
    el.innerHTML = `
        <div class="iig-error-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21.73 18 13.73 3.27a2 2 0 0 0-3.46 0L2.27 18a2 2 0 0 0 1.73 3h16a2 2 0 0 0 1.73-3"/>
                <path d="M12 9v4"/>
                <path d="M12 17h.01"/>
            </svg>
        </div>
        <div class="iig-error-title">Генерация не удалась</div>
        <div class="iig-error-msg" title="${sanitizeForHtml(fullMsg)}">${sanitizeForHtml(shortMsg)}</div>
        <button class="iig-error-retry menu_button" type="button"><i class="fa-solid fa-rotate"></i><span>Попробовать снова</span></button>
    `;
    // Retry button — reuse the same flow as the regen overlay on success images
    el.querySelector('.iig-error-retry')?.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        await retryFailedGeneration(el, instructionValue);
    });
    return el;
}

// Replace error placeholder with loading, run generateImageWithRetry, then swap to final image
// (or back to a new error placeholder if it fails again).
async function retryFailedGeneration(errorEl, instructionJsonStr) {
    if (!getSettings().enabled) { toastr.info('Генерация выключена в настройках SLAY Images', 'SLAY Images'); return; }
    if (!errorEl || !errorEl.isConnected) return;
    if (errorEl.dataset.iigRetrying === '1') return;
    errorEl.dataset.iigRetrying = '1';

    // Parse instruction
    let data;
    try {
        const decoded = String(instructionJsonStr || '')
            .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
            .replace(/&#39;/g, "'").replace(/&#34;/g, '"').replace(/&amp;/g, '&');
        try { data = JSON.parse(decoded); }
        catch (_) { data = JSON.parse(decoded.replace(/'/g, '"')); }
    } catch (err) {
        toastr.error('Не удалось распарсить параметры картинки', 'SLAY Images');
        errorEl.dataset.iigRetrying = '0';
        return;
    }

    const mesEl = errorEl.closest('.mes');
    const messageId = mesEl ? parseInt(mesEl.getAttribute('mesid'), 10) : undefined;
    const ctx = SillyTavern.getContext();
    const message = (Number.isInteger(messageId) && ctx?.chat) ? ctx.chat[messageId] : null;

    // Swap error placeholder for loading placeholder
    const tagId = errorEl.dataset.tagId || `iig-retry-${Date.now()}`;
    const loading = createLoadingPlaceholder(tagId);
    errorEl.replaceWith(loading);
    const labelEl = loading.querySelector('.iig-status-label');
    const timerEl = loading.querySelector('.iig-status-timer');

    try {
        const result = await generateImageWithRetry(data.prompt, data.style,
            (s) => { if (labelEl?.isConnected) labelEl.textContent = s; },
            { aspectRatio: data.aspect_ratio, imageSize: data.image_size, quality: data.quality, preset: data.preset, messageId });
        if (labelEl?.isConnected) labelEl.textContent = 'Сохранение...';
        if (timerEl?.isConnected) timerEl.textContent = '';
        const imagePath = isGeneratedVideoResult(result)
            ? await saveNaisteraMediaToFile(result.dataUrl, 'video')
            : await saveImageToFile(result);
        const newEl = createGeneratedMediaElement(imagePath, { style: data.style, prompt: data.prompt });
        if (instructionJsonStr) newEl.setAttribute('data-iig-instruction', instructionJsonStr);
        if (loading._timerInterval) clearInterval(loading._timerInterval);
        if (loading.isConnected) loading.replaceWith(newEl);
        if (newEl.getAttribute('data-iig-instruction')) attachRegenButton(newEl);

        // Persist new src in message source so it survives reload.
        // CRITICAL: use replaceImageSrcEverywhere() — it patches mes,
        // display_text, extblocks AND swipes[swipe_id] + swipe_info. The old
        // hand-rolled replace only touched mes/display_text/extblocks and
        // missed swipes — which is what ST actually re-renders from on chat
        // reload, so the error.svg src in swipes[0] would silently win and
        // bring the error placeholder back every time the user came back to
        // the chat.
        if (message) {
            // Try every marker a failed tag may carry: the current inline one,
            // whatever this install resolves error.svg to, and the legacy
            // hardcoded paths — chats written by older builds still hold those.
            let replaced = false;
            for (const cand of iigErrorSrcCandidates()) {
                if (cand && replaceImageSrcEverywhere(message, cand, imagePath)) replaced = true;
            }
            // LEGACY format: failed old-style tags are stored as literal
            // [IMG:ERROR:reason] in the message text — there is no error.svg src
            // to replace, so the block above no-ops and the retry result never
            // persisted (error came back on reload). Rewrite those markers to
            // the legacy success form in every store.
            // indexOf guard, NOT .test() — a /g regex's test() advances lastIndex
            // and silently fails on the next call.
            const legacyRewrite = (str) => (typeof str === 'string' && str.indexOf('[IMG:ERROR:') !== -1)
                ? str.replace(/\[IMG:ERROR:[^\]]*\]/g, `[IMG:✓:${imagePath}]`)
                : null;
            const tryField = (obj, key) => {
                const out = legacyRewrite(obj?.[key]);
                if (out !== null && out !== undefined) { obj[key] = out; replaced = true; }
            };
            tryField(message, 'mes');
            if (message.extra) { tryField(message.extra, 'display_text'); tryField(message.extra, 'extblocks'); }
            if (Array.isArray(message.swipes)) {
                for (let i = 0; i < message.swipes.length; i++) {
                    const out = legacyRewrite(message.swipes[i]);
                    if (out !== null && out !== undefined) { message.swipes[i] = out; replaced = true; }
                }
            }
            if (replaced) {
                try { await ctx.saveChat?.(); } catch (e) { ctx.saveChatDebounced?.(); }
            }
        }
        toastr.success('Картинка сгенерирована', 'SLAY Images', { timeOut: 2000 });
    } catch (err) {
        const errorMsg = err?.message || String(err);
        iigLog('ERROR', `Retry failed: ${errorMsg}`);
        if (loading._timerInterval) clearInterval(loading._timerInterval);
        // Fall back to a new error placeholder with the same instruction
        const newError = createErrorPlaceholder(tagId, errorMsg, { fullMatch: instructionJsonStr ? `data-iig-instruction='${instructionJsonStr}'` : '' });
        if (loading.isConnected) loading.replaceWith(newError);
        toastr.error(`Ошибка: ${errorMsg}`, 'SLAY Images');
    } finally {
        // Retry is the third path that fills the context-ref memo; only the
        // automatic one ever emptied it.
        if (Number.isInteger(messageId)) clearContextRefCache(messageId);
    }
}

// ── Message processing (merged: sillyimages externalBlocks + notsosillynotsoimages guards) ──
async function processMessageTags(messageId) {
    const context = SillyTavern.getContext();
    const settings = getSettings();
    if (!settings.enabled) return;
    if (processingMessages.has(messageId)) return;
    const lastProcessed = recentlyProcessed.get(messageId);
    if (lastProcessed && (Date.now() - lastProcessed) < REPROCESS_COOLDOWN_MS) return;

    const message = context.chat[messageId];
    if (!message || message.is_user) return;

    const tags = await parseMessageImageTags(message, { checkExistence: true });
    if (tags.length === 0) return;

    processingMessages.add(messageId);
    iigLog('INFO', `Found ${tags.length} tag(s) in message ${messageId}`);
    toastr.info(`Найдено ${tags.length} тег(ов). Генерация...`, 'SLAY Images', { timeOut: 3000 });

    const messageElement = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
    if (!messageElement) { processingMessages.delete(messageId); return; }
    const mesTextEl = messageElement.querySelector('.mes_text');
    if (!mesTextEl) { processingMessages.delete(messageId); return; }

    const processTag = async (tag, index) => {
        const tagId = `iig-${messageId}-${index}`;
        const loadingPlaceholder = createLoadingPlaceholder(tagId);
        let targetElement = null;

        if (tag.isNewFormat) {
            const allImgs = mesTextEl.querySelectorAll('img[data-iig-instruction], video[data-iig-instruction]');
            const searchPrompt = tag.prompt.substring(0, 30);
            for (const img of allImgs) {
                const instruction = img.getAttribute('data-iig-instruction');
                if (instruction) {
                    const decoded = instruction.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'").replace(/&#34;/g, '"').replace(/&amp;/g, '&');
                    const normalizedSearch = searchPrompt.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'").replace(/&#34;/g, '"').replace(/&amp;/g, '&');
                    if (decoded.includes(normalizedSearch)) { targetElement = img; break; }
                    try { const d = JSON.parse(decoded.replace(/'/g, '"')); if (d.prompt?.substring(0, 30) === tag.prompt.substring(0, 30)) { targetElement = img; break; } } catch (e) { }
                    if (instruction.includes(searchPrompt)) { targetElement = img; break; }
                }
            }
            if (!targetElement) {
                for (const img of allImgs) { const src = img.getAttribute('src') || ''; if (src.includes('[IMG:GEN]') || src === '' || src === '#') { targetElement = img; break; } }
            }
            if (!targetElement) {
                for (const img of mesTextEl.querySelectorAll('img')) { const src = img.getAttribute('src') || ''; if (src.includes('[IMG:GEN]') || src.includes('[IMG:ERROR]')) { targetElement = img; break; } }
            }
        } else {
            const tagEscaped = tag.fullMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/"/g, '(?:"|&quot;)');
            const before = mesTextEl.innerHTML;
            mesTextEl.innerHTML = mesTextEl.innerHTML.replace(new RegExp(tagEscaped, 'g'), `<span data-iig-placeholder="${tagId}"></span>`);
            if (before !== mesTextEl.innerHTML) targetElement = mesTextEl.querySelector(`[data-iig-placeholder="${tagId}"]`);
            if (!targetElement) { for (const img of mesTextEl.querySelectorAll('img')) { if (img.src?.includes('[IMG:GEN:')) { targetElement = img; break; } } }
        }

        if (targetElement) targetElement.replaceWith(loadingPlaceholder);
        else mesTextEl.appendChild(loadingPlaceholder);

        const statusEl = loadingPlaceholder.querySelector('.iig-status');
        const labelEl = loadingPlaceholder.querySelector('.iig-status-label') || statusEl;
        const timerEl = loadingPlaceholder.querySelector('.iig-status-timer');
        try {
            const result = await generateImageWithRetry(tag.prompt, tag.style, (s) => { labelEl.textContent = s; }, { aspectRatio: tag.aspectRatio, imageSize: tag.imageSize, quality: tag.quality, preset: tag.preset, messageId });

            labelEl.textContent = 'Сохранение...';
            if (timerEl) timerEl.textContent = '';

            if (isGeneratedVideoResult(result)) {
                const videoPath = await saveNaisteraMediaToFile(result.dataUrl, 'video');
                let posterPath = '';
                if (result.posterDataUrl) { try { posterPath = await saveImageToFile(result.posterDataUrl); } catch (e) { } }
                const videoEl = createGeneratedMediaElement({ ...result, dataUrl: videoPath }, tag);
                if (posterPath) videoEl.poster = posterPath;
                if (loadingPlaceholder._timerInterval) clearInterval(loadingPlaceholder._timerInterval);
                loadingPlaceholder.replaceWith(videoEl);
                const persisted = buildPersistedVideoTag(tag.fullMatch, videoPath, posterPath);
                replaceTagInMessageSource(message, tag, persisted);
            } else {
                const imagePath = await saveImageToFile(result);
                const img = createGeneratedMediaElement(imagePath, tag);
                if (tag.isNewFormat) {
                    const instrMatch = tag.fullMatch.match(/data-iig-instruction\s*=\s*(['"])([\s\S]*?)\1/i);
                    if (instrMatch) img.setAttribute('data-iig-instruction', instrMatch[2]);
                }
                if (loadingPlaceholder._timerInterval) clearInterval(loadingPlaceholder._timerInterval);
                loadingPlaceholder.replaceWith(img);
                // Attach regen button (only meaningful when there's data-iig-instruction, i.e. new format)
                if (img.getAttribute('data-iig-instruction')) attachRegenButton(img);
                if (tag.isNewFormat) {
                    const updatedTag = tag.fullMatch.replace(/src\s*=\s*(['"])[^'"]*\1/i, `src="${imagePath}"`);
                    replaceTagInMessageSource(message, tag, updatedTag);
                } else {
                    replaceTagInMessageSource(message, tag, `[IMG:✓:${imagePath}]`);
                }
            }

            sessionGenCount++; updateSessionStats();
            toastr.success(`Картинка ${index + 1}/${tags.length} готова`, 'SLAY Images', { timeOut: 2000 });
        } catch (error) {
            iigLog('ERROR', `Tag ${index} failed:`, error.message);
            const errorPlaceholder = createErrorPlaceholder(tagId, error.message, tag);
            if (loadingPlaceholder._timerInterval) clearInterval(loadingPlaceholder._timerInterval);
            loadingPlaceholder.replaceWith(errorPlaceholder);
            if (tag.isNewFormat) {
                // NEVER trade a working image for an error marker. If this tag
                // already points at a real generated file, the failure is ours
                // to show on screen — the message keeps the picture it had.
                // Without this guard a transient failure permanently erased the
                // path while the file sat safely on disk.
                const prevSrc = (tag.fullMatch.match(/src\s*=\s*(['"])([^'"]*)\1/i) || [])[2] || '';
                if (iigIsLiveImagePath(prevSrc)) {
                    iigLog('WARN', `Tag ${index} failed but already had an image — keeping it, error shown in DOM only`);
                } else {
                    const errorTag = tag.fullMatch
                        .replace(/src\s*=\s*(['"])[^'"]*\1/i, `src="${IIG_ERROR_SRC}"`)
                        .replace(/^<img\b/i, '<img data-iig-error="1"');
                    replaceTagInMessageSource(message, tag, errorTag);
                }
            } else {
                replaceTagInMessageSource(message, tag, `[IMG:ERROR:${error.message.substring(0, 50)}]`);
            }
            sessionErrorCount++; updateSessionStats();
            toastr.error(`Ошибка: ${error.message}`, 'SLAY Images');
        }
    };

    try {
        await Promise.all(tags.map((tag, index) => processTag(tag, index)));
    } finally {
        try {
            recentlyProcessed.set(messageId, Date.now());
            await context.saveChat();
        } finally { processingMessages.delete(messageId); clearContextRefCache(messageId); }
    }
}

async function regenerateMessageImages(messageId) {
    if (!getSettings().enabled) { toastr.info('Генерация выключена в настройках SLAY Images', 'SLAY Images'); return; }
    const context = SillyTavern.getContext();
    const message = context.chat[messageId];
    if (!message) { toastr.error('Сообщение не найдено', 'SLAY Images'); return; }
    const tags = await parseImageTags(message.mes, { forceAll: true });
    if (tags.length === 0) { toastr.warning('Нет тегов для регенерации', 'SLAY Images'); return; }

    iigLog('INFO', `Regenerating ${tags.length} images in message ${messageId}`);
    processingMessages.add(messageId);

    const messageElement = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
    if (!messageElement) { processingMessages.delete(messageId); return; }
    const mesTextEl = messageElement.querySelector('.mes_text');
    if (!mesTextEl) { processingMessages.delete(messageId); return; }

    // Snapshot the target elements ONCE, before anything is replaced. The old
    // code re-queried inside the loop and indexed by the loop counter: as soon
    // as one tag failed, its element had been swapped for a placeholder that
    // carries no data-iig-instruction, the list got shorter, and every later
    // tag addressed the wrong image — regenerating tag N onto image N+1, then
    // silently skipping the last one with no message at all.
    const targetEls = [...mesTextEl.querySelectorAll('img[data-iig-instruction], video[data-iig-instruction]')];

    for (let index = 0; index < tags.length; index++) {
        const tag = tags[index];
        const tagId = `iig-regen-${messageId}-${index}`;
        let loadingPlaceholder = null;
        try {
            const existingEl = targetEls[index] || null;
            if (existingEl) {
                const instruction = existingEl.getAttribute('data-iig-instruction');
                loadingPlaceholder = createLoadingPlaceholder(tagId);
                // Replace the WRAPPER when there is one. Replacing only the <img>
                // left the old span.iig-img-wrap and its regen button in place,
                // still closed over the detached image — so a later click on that
                // button updated the picture on screen but never wrote it to the
                // chat, and the old image came back on the next reload.
                (existingEl.closest('.iig-img-wrap') || existingEl).replaceWith(loadingPlaceholder);
                const statusEl = loadingPlaceholder.querySelector('.iig-status');
                const labelEl = loadingPlaceholder.querySelector('.iig-status-label') || statusEl;
                const timerEl = loadingPlaceholder.querySelector('.iig-status-timer');
                const result = await generateImageWithRetry(tag.prompt, tag.style, (s) => { labelEl.textContent = s; }, { aspectRatio: tag.aspectRatio, imageSize: tag.imageSize, quality: tag.quality, preset: tag.preset, messageId });
                labelEl.textContent = 'Сохранение...';
                if (timerEl) timerEl.textContent = '';

                if (isGeneratedVideoResult(result)) {
                    const videoPath = await saveNaisteraMediaToFile(result.dataUrl, 'video');
                    const videoEl = createGeneratedMediaElement({ ...result, dataUrl: videoPath }, tag);
                    // createGeneratedMediaElement doesn't carry the instruction over,
                    // so without this the element vanishes from every later lookup.
                    if (instruction && !videoEl.getAttribute('data-iig-instruction')) videoEl.setAttribute('data-iig-instruction', instruction);
                    if (loadingPlaceholder._timerInterval) clearInterval(loadingPlaceholder._timerInterval);
                    loadingPlaceholder.replaceWith(videoEl);
                    targetEls[index] = videoEl;
                    const persisted = buildPersistedVideoTag(tag.fullMatch, videoPath);
                    replaceTagInMessageSource(message, tag, persisted);
                } else {
                    const imagePath = await saveImageToFile(result);
                    const img = document.createElement('img');
                    img.className = 'iig-generated-image'; img.src = imagePath; img.alt = tag.prompt;
                    if (instruction) img.setAttribute('data-iig-instruction', instruction);
                    if (loadingPlaceholder._timerInterval) clearInterval(loadingPlaceholder._timerInterval);
                    loadingPlaceholder.replaceWith(img);
                    targetEls[index] = img;
                    // Give the fresh image its own regen button — the previous one
                    // went out with the wrapper we just replaced.
                    try { attachRegenButton(img); } catch (e) { iigLog('WARN', 'attachRegenButton after regen failed:', e.message); }
                    const updatedTag = tag.fullMatch.replace(/src\s*=\s*(['"])[^'"]*\1/i, `src="${imagePath}"`);
                    // All stores, not just message.mes: ST re-renders from swipes
                    // and display_text, so patching one field alone let the old
                    // image resurrect on the next swipe or reload.
                    replaceTagInMessageSource(message, tag, updatedTag);
                }
                toastr.success(`Картинка ${index + 1}/${tags.length} готова`, 'SLAY Images', { timeOut: 2000 });
            }
        } catch (error) {
            iigLog('ERROR', `Regen failed tag ${index}:`, error.message);
            // Clean up after ourselves. Without this the spinner stayed in the
            // message forever — the image gone from view, no error card, no retry
            // button — which is what users described as "it ate my picture".
            if (loadingPlaceholder) {
                if (loadingPlaceholder._timerInterval) clearInterval(loadingPlaceholder._timerInterval);
                const errorEl = createErrorPlaceholder(tagId, error.message, tag);
                loadingPlaceholder.replaceWith(errorEl);
                targetEls[index] = errorEl;
            }
            toastr.error(`Ошибка: ${error.message}`, 'SLAY Images');
        }
    }

    processingMessages.delete(messageId);
    // The automatic path clears this in its finally block; the regenerate button
    // never did, so its entries sat in the map until the tab closed.
    clearContextRefCache(messageId);
    recentlyProcessed.set(messageId, Date.now());
    await context.saveChat();
}

function addRegenerateButton(messageElement, messageId) {
    if (messageElement.querySelector('.iig-regenerate-btn')) return;
    const extraMesButtons = messageElement.querySelector('.extraMesButtons');
    if (!extraMesButtons) return;
    const btn = document.createElement('div');
    btn.className = 'mes_button iig-regenerate-btn fa-solid fa-images interactable';
    btn.title = 'Регенерировать картинки'; btn.tabIndex = 0;
    btn.addEventListener('click', async (e) => { e.stopPropagation(); await regenerateMessageImages(messageId); });
    extraMesButtons.appendChild(btn);
}

function addButtonsToExistingMessages() {
    if (!getSettings().enabled) return;
    const context = SillyTavern.getContext();
    if (!context.chat || context.chat.length === 0) return;
    for (const el of document.querySelectorAll('#chat .mes')) {
        const mesId = el.getAttribute('mesid');
        if (mesId === null) continue;
        const messageId = parseInt(mesId, 10);
        const message = context.chat[messageId];
        if (message && !message.is_user) addRegenerateButton(el, messageId);
    }
}

async function onMessageReceived(messageId) {
    if (_eventHandlerDepth >= MAX_EVENT_HANDLER_DEPTH) { iigLog('WARN', `Blocked recursive handler (depth=${_eventHandlerDepth})`); return; }
    _eventHandlerDepth++;
    try {
        const settings = getSettings();
        if (!settings.enabled) return;
        const messageElement = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
        if (!messageElement) return;
        addRegenerateButton(messageElement, messageId);
        await processMessageTags(messageId);
    } finally { _eventHandlerDepth--; }
}


/* ╔═══════════════════════════════════════════════════════════════╗
   ║  MODULE 3: Settings UI + Initialization                       ║
   ╚═══════════════════════════════════════════════════════════════╝ */

function renderRefSlots() {
    const settings = getCurrentCharacterRefs();
    const charDisplayName = getActiveCharacterName() || 'Character';
    const userDisplayName = getActiveUserName() || 'User';
    const setThumb = (slot, ref) => {
        const thumb = slot?.querySelector('.iig-ref-thumb');
        const wrap = slot?.querySelector('.iig-ref-thumb-wrap');
        if (!thumb) return;
        if (ref?.imagePath) thumb.src = ref.imagePath;
        else if (ref?.imageBase64) thumb.src = 'data:image/jpeg;base64,' + ref.imageBase64;
        else if (ref?.imageData) thumb.src = 'data:image/jpeg;base64,' + ref.imageData;
        else thumb.src = '';
        if (wrap) wrap.classList.toggle('has-image', !!(ref?.imagePath || ref?.imageBase64 || ref?.imageData));
    };
    // Don't clobber a name input that the user is currently typing in.
    const setNameInput = (input, value) => {
        if (!input) return;
        if (document.activeElement === input) return;
        input.value = value || '';
    };
    const charSlot = document.querySelector('.iig-ref-slot[data-ref-type="char"]');
    if (charSlot) {
        setThumb(charSlot, settings.charRef);
        setNameInput(charSlot.querySelector('.iig-ref-name'), settings.charRef?.name);
        const label = charSlot.querySelector('.iig-ref-label');
        if (label) label.textContent = charDisplayName;
    }
    const userSlot = document.querySelector('.iig-ref-slot[data-ref-type="user"]');
    if (userSlot) {
        setThumb(userSlot, settings.userRef);
        setNameInput(userSlot.querySelector('.iig-ref-name'), settings.userRef?.name);
        const label = userSlot.querySelector('.iig-ref-label');
        if (label) label.textContent = userDisplayName;
    }
    for (let i = 0; i < 4; i++) {
        const slot = document.querySelector(`.iig-ref-slot[data-ref-type="npc"][data-npc-index="${i}"]`);
        if (!slot) continue;
        const npc = settings.npcReferences[i] || null;
        setThumb(slot, npc);
        setNameInput(slot.querySelector('.iig-ref-name'), npc?.name);
    }
}

let _renderRefSlotsDebounce = null;
function renderRefSlotsDebounced() {
    clearTimeout(_renderRefSlotsDebounce);
    _renderRefSlotsDebounce = setTimeout(renderRefSlots, 200);
}

function createSettingsUI() {
    const settings = getSettings();
    const container = document.getElementById('extensions_settings');
    if (!container) return;

    let npcSlotsHtml = '';
    for (let i = 0; i < 4; i++) {
        npcSlotsHtml += `<div class="iig-ref-slot" data-ref-type="npc" data-npc-index="${i}">
            <div class="iig-ref-thumb-wrap"><img src="" alt="NPC" class="iig-ref-thumb"><div class="iig-ref-empty-icon"><i class="fa-solid fa-user-plus"></i></div><div class="iig-ref-upload-overlay" title="Upload"><i class="fa-solid fa-camera"></i></div></div>
            <input type="file" accept="image/*" class="iig-ref-file-input" style="display:none">
            <div class="iig-ref-info"><div class="iig-ref-label">NPC ${i + 1}</div><input type="text" class="text_pole iig-ref-name" placeholder="Имя (Eva, Ева)" value=""></div>
            <div class="iig-ref-actions"><div class="menu_button iig-ref-upload-btn" title="Upload"><i class="fa-solid fa-upload"></i></div><div class="menu_button iig-ref-crop-btn" title="Обрезать"><i class="fa-solid fa-crop-simple"></i></div><div class="menu_button iig-ref-save-btn" title="Сохранить персонажа в библиотеку"><i class="fa-solid fa-floppy-disk"></i></div><div class="menu_button iig-ref-delete-btn" title="Удалить"><i class="fa-solid fa-trash-can"></i></div></div>
        </div>`;
    }

    const swSettings = SillyTavern.getContext().extensionSettings.slay_wardrobe || {};

    const html = `
    <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>💅🔥 SLAY Images</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <div class="iig-settings">
                <label class="checkbox_label"><input type="checkbox" id="slay_enabled" ${settings.enabled ? 'checked' : ''}><span>Включить генерацию</span></label>
                <label class="checkbox_label"><input type="checkbox" id="slay_sw_enabled" ${swSettings.wardrobeEnabled !== false ? 'checked' : ''}><span>Включить гардероб</span></label>
                <div id="slay_settings_body" class="${settings.enabled ? '' : 'iig-hidden'}">
                    <label class="checkbox_label"><input type="checkbox" id="slay_external_blocks" ${settings.externalBlocks ? 'checked' : ''}><span>External blocks (extblocks)</span></label>
                    <hr>

                    <!-- API -->
                <div class="iig-section">
                    <h4><i class="fa-solid fa-plug"></i> API</h4>
                    <div class="flex-row"><label>Профиль</label><div class="flex1" style="display:flex;gap:6px;min-width:0;"><select id="slay_conn_profile" class="flex1" style="min-width:0;"><option value="">— профили подключений —</option></select><div id="slay_conn_profile_save" class="menu_button" title="Сохранить текущее подключение как профиль"><i class="fa-solid fa-floppy-disk"></i></div><div id="slay_conn_profile_delete" class="menu_button" title="Удалить выбранный профиль"><i class="fa-solid fa-trash-can"></i></div></div></div>
                    <div class="flex-row"><label>Тип API</label><select id="slay_api_type" class="flex1"><option value="openai" ${settings.apiType === 'openai' ? 'selected' : ''}>OpenAI-compatible</option><option value="gemini" ${settings.apiType === 'gemini' ? 'selected' : ''}>Gemini-compatible</option><option value="naistera" ${settings.apiType === 'naistera' ? 'selected' : ''}>Naistera</option><option value="custom" ${settings.apiType === 'custom' ? 'selected' : ''}>Custom (свой URL)</option></select></div>
                    <div class="flex-row ${settings.apiType === 'custom' ? '' : 'iig-hidden'}" id="slay_custom_format_row"><label>Формат запроса</label><select id="slay_custom_body_format" class="flex1"><option value="chat" ${(settings.customBodyFormat || 'chat') === 'chat' ? 'selected' : ''}>chat/completions (мультимодальный)</option><option value="images" ${settings.customBodyFormat === 'images' ? 'selected' : ''}>images/generations (DALL-E style)</option></select></div>
                    <p class="hint ${settings.apiType === 'custom' ? '' : 'iig-hidden'}" id="slay_custom_hint">Custom: в Endpoint вставь <b>полный URL</b> конечной точки (например <i>https://api.xxx/ai/openai/image</i>) — расширение ничего не дописывает. Формат «images/generations» не поддерживает референсы (картинки-рефы не отправляются).</p>
                    <div class="flex-row"><label>Endpoint</label><input type="text" id="slay_endpoint" class="text_pole flex1" value="${sanitizeForHtml(settings.endpoint)}" placeholder="${getEndpointPlaceholder(settings.apiType)}"></div>
                    <div class="flex-row"><label>API Key</label><input type="password" id="slay_api_key" class="text_pole flex1" value="${sanitizeForHtml(settings.apiKey)}"><div id="slay_key_toggle" class="menu_button iig-key-toggle" title="Show/Hide"><i class="fa-solid fa-eye"></i></div></div>
                    <p id="slay_naistera_hint" class="hint ${settings.apiType === 'naistera' ? '' : 'iig-hidden'}">Naistera: вставьте токен из Telegram-бота.</p>
                    <div class="flex-row ${settings.apiType === 'naistera' ? 'iig-hidden' : ''}" id="slay_model_row"><label>Модель</label><select id="slay_model_select" class="text_pole flex1 ${settings.manualModel ? 'iig-hidden' : ''}"></select><input type="text" id="slay_model" class="text_pole flex1 ${settings.manualModel ? '' : 'iig-hidden'}" placeholder="название модели" value="${sanitizeForHtml(settings.model || '')}" autocomplete="off" spellcheck="false"><div id="slay_refresh_models" class="menu_button iig-refresh-btn" title="Обновить список"><i class="fa-solid fa-sync"></i></div></div>
                    <label class="checkbox_label" id="slay_manual_model_row" style="margin-top:2px;"><input type="checkbox" id="slay_manual_model" ${settings.manualModel ? 'checked' : ''}><span style="font-size:0.85em;opacity:0.85;">Ввести название модели вручную</span></label>
                    <div id="slay_test_connection" class="menu_button iig-test-connection"><i class="fa-solid fa-wifi"></i> Тест</div>
                </div>
                <hr>

                <!-- Gen params -->
                <div class="iig-section">
                    <h4><i class="fa-solid fa-sliders"></i> Параметры генерации</h4>
                    <div class="flex-row ${settings.apiType !== 'openai' ? 'iig-hidden' : ''}" id="slay_size_row"><label>Размер</label><select id="slay_size" class="flex1"><option value="1024x1024" ${settings.size === '1024x1024' ? 'selected' : ''}>1024x1024</option><option value="1792x1024" ${settings.size === '1792x1024' ? 'selected' : ''}>1792x1024</option><option value="1024x1792" ${settings.size === '1024x1792' ? 'selected' : ''}>1024x1792</option><option value="512x512" ${settings.size === '512x512' ? 'selected' : ''}>512x512</option></select></div>
                    <div class="flex-row ${settings.apiType !== 'openai' ? 'iig-hidden' : ''}" id="slay_quality_row"><label>Качество</label><select id="slay_quality" class="flex1"><option value="standard" ${settings.quality === 'standard' ? 'selected' : ''}>Standard</option><option value="hd" ${settings.quality === 'hd' ? 'selected' : ''}>HD</option></select></div>
                    <div id="slay_gemini_params" class="${settings.apiType !== 'gemini' ? 'iig-hidden' : ''}">
                        <div class="flex-row"><label>Соотношение сторон</label><select id="slay_aspect_ratio" class="flex1"><option value="auto" ${(settings.aspectRatio || 'auto') === 'auto' ? 'selected' : ''}>Из промпта</option><option value="1:1" ${settings.aspectRatio === '1:1' ? 'selected' : ''}>1:1</option><option value="2:3" ${settings.aspectRatio === '2:3' ? 'selected' : ''}>2:3</option><option value="3:2" ${settings.aspectRatio === '3:2' ? 'selected' : ''}>3:2</option><option value="3:4" ${settings.aspectRatio === '3:4' ? 'selected' : ''}>3:4</option><option value="4:3" ${settings.aspectRatio === '4:3' ? 'selected' : ''}>4:3</option><option value="4:5" ${settings.aspectRatio === '4:5' ? 'selected' : ''}>4:5</option><option value="5:4" ${settings.aspectRatio === '5:4' ? 'selected' : ''}>5:4</option><option value="9:16" ${settings.aspectRatio === '9:16' ? 'selected' : ''}>9:16</option><option value="16:9" ${settings.aspectRatio === '16:9' ? 'selected' : ''}>16:9</option><option value="21:9" ${settings.aspectRatio === '21:9' ? 'selected' : ''}>21:9</option></select></div>
                        <div class="flex-row"><label>Разрешение</label><select id="slay_image_size" class="flex1"><option value="1K" ${settings.imageSize === '1K' ? 'selected' : ''}>1K</option><option value="2K" ${settings.imageSize === '2K' ? 'selected' : ''}>2K</option><option value="4K" ${settings.imageSize === '4K' ? 'selected' : ''}>4K</option></select></div>
                    </div>
                    <div class="flex-row ${settings.apiType === 'naistera' ? '' : 'iig-hidden'}" id="slay_naistera_model_row"><label>Модель Naistera</label><select id="slay_naistera_model" class="flex1"><option value="grok" ${normalizeNaisteraModel(settings.naisteraModel) === 'grok' ? 'selected' : ''}>Grok</option><option value="nano banana" ${normalizeNaisteraModel(settings.naisteraModel) === 'nano banana' ? 'selected' : ''}>Nano Banana</option><option value="grok-pro" ${normalizeNaisteraModel(settings.naisteraModel) === 'grok-pro' ? 'selected' : ''}>Grok Pro</option><option value="novelai" ${normalizeNaisteraModel(settings.naisteraModel) === 'novelai' ? 'selected' : ''}>NovelAI</option></select></div>
                    <div class="flex-row ${settings.apiType === 'naistera' ? '' : 'iig-hidden'}" id="slay_naistera_aspect_row"><label>Соотношение</label><select id="slay_naistera_aspect_ratio" class="flex1"><option value="auto" ${(settings.naisteraAspectRatio || 'auto') === 'auto' ? 'selected' : ''}>Из промпта</option><option value="1:1" ${settings.naisteraAspectRatio === '1:1' ? 'selected' : ''}>1:1</option><option value="3:2" ${settings.naisteraAspectRatio === '3:2' ? 'selected' : ''}>3:2</option><option value="2:3" ${settings.naisteraAspectRatio === '2:3' ? 'selected' : ''}>2:3</option></select></div>
                    <div class="flex-row" id="slay_style_row"><label>Стиль</label><div class="flex1" style="display:flex;gap:6px;align-items:center;min-width:0;"><span id="slay_style_name" style="flex:1;min-width:30px;font-size:0.8em;opacity:0.7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${settings.slayStyleName || 'Не заменять'}</span><div id="slay_style_pick_btn" class="menu_button" style="white-space:nowrap;flex-shrink:0;display:inline-flex;align-items:center;gap:7px;"><i class="fa-solid fa-palette"></i><span>Выбрать</span></div></div></div>
                </div>

                <!-- NPC refs -->
                <div id="slay_refs_section" class="iig-refs">
                    <h4 class="iig-refs-h4">
                        <span><i class="fa-solid fa-user-group"></i> Референсы персонажей</span>
                        <button type="button" id="slay_saved_toggle" class="iig-saved-toggle" title="Сохранённые персонажи — портреты с именами, годятся для любого чата">
                            <i class="fa-solid fa-heart"></i> Сохранённые <span id="slay_saved_count" class="iig-saved-count"></span>
                        </button>
                    </h4>
                    <p class="hint">Рефы (char / user / NPC) и картинки одежды отправляются <b>только</b> когда в промпте картинки упомянуто имя. В поле «Имя» можно указать несколько вариантов через запятую (например, <i>Ева, Eve, Eva, Ivy, Иви</i>) — реф подтянется если встретится любой. Пишите имена с большой буквы (!). Чтобы полностью отключить реф для слота — удалите картинку из него.</p>
                    <div class="iig-refs-grid">
                        <div class="iig-refs-row iig-refs-main">
                            <div class="iig-ref-slot" data-ref-type="char"><div class="iig-ref-thumb-wrap"><img src="" alt="Char" class="iig-ref-thumb"><div class="iig-ref-empty-icon"><i class="fa-solid fa-user"></i></div><div class="iig-ref-upload-overlay" title="Upload"><i class="fa-solid fa-camera"></i></div></div><input type="file" accept="image/*" class="iig-ref-file-input" style="display:none"><div class="iig-ref-info"><div class="iig-ref-label">{{char}}</div><input type="text" class="text_pole iig-ref-name" placeholder="Имя (Eva, Ева)" value=""></div><div class="iig-ref-actions"><div class="menu_button iig-ref-upload-btn" title="Upload"><i class="fa-solid fa-upload"></i></div><div class="menu_button iig-ref-crop-btn" title="Обрезать"><i class="fa-solid fa-crop-simple"></i></div><div class="menu_button iig-ref-save-btn" title="Сохранить персонажа в библиотеку"><i class="fa-solid fa-floppy-disk"></i></div><div class="menu_button iig-ref-delete-btn" title="Удалить"><i class="fa-solid fa-trash-can"></i></div></div></div>
                            <div class="iig-ref-slot" data-ref-type="user"><div class="iig-ref-thumb-wrap"><img src="" alt="User" class="iig-ref-thumb"><div class="iig-ref-empty-icon"><i class="fa-solid fa-user"></i></div><div class="iig-ref-upload-overlay" title="Upload"><i class="fa-solid fa-camera"></i></div></div><input type="file" accept="image/*" class="iig-ref-file-input" style="display:none"><div class="iig-ref-info"><div class="iig-ref-label">{{user}}</div><input type="text" class="text_pole iig-ref-name" placeholder="Имя (Eva, Ева)" value=""></div><div class="iig-ref-actions"><div class="menu_button iig-ref-upload-btn" title="Upload"><i class="fa-solid fa-upload"></i></div><div class="menu_button iig-ref-crop-btn" title="Обрезать"><i class="fa-solid fa-crop-simple"></i></div><div class="menu_button iig-ref-save-btn" title="Сохранить персонажа в библиотеку"><i class="fa-solid fa-floppy-disk"></i></div><div class="menu_button iig-ref-delete-btn" title="Удалить"><i class="fa-solid fa-trash-can"></i></div></div></div>
                        </div>
                        <div class="iig-refs-divider"><span>NPCs</span></div>
                        <div class="iig-refs-row iig-refs-npcs">${npcSlotsHtml}</div>
                    </div>
                    <!-- v4.2 Recent refs ribbon — populated on render -->
                    <label class="checkbox_label" style="margin-top:10px;"><input type="checkbox" id="slay_skip_crop" ${settings.skipCrop ? 'checked' : ''}><span>Не предлагать кроп картинок</span></label>
                    <p class="hint" style="margin-top:2px;font-size:0.75em;">Касается рефов, образов и вещей гардероба.</p>
                    <div id="slay_recent_refs_ribbon" class="iig-recent-refs-ribbon"></div>
                    <!-- Saved character library — permanent, named, survives chat switches -->
                    <div id="slay_saved_portraits" class="iig-saved-panel iig-hidden"></div>
                </div>
                <!-- v4.2 Floating popup for slot options (Файл / Вставить / Недавние) -->
                <div id="slay_slot_options_popup" class="iig-slot-options-popup"></div>
                <!-- v4.2 Floating popup for "assign recent to slot" -->
                <div id="slay_assign_popup" class="iig-assign-popup"></div>

                </div>
                <!-- Wardrobe — deliberately OUTSIDE #slay_settings_body: it must stay
                     reachable when image generation is switched off, because the outfit
                     description keeps going into the prompt either way. Its position in
                     the panel is unchanged. -->
                <div id="slay_wardrobe_body" class="${swSettings.wardrobeEnabled !== false ? '' : 'iig-hidden'}">
                <div class="iig-section">
                    <h4><i class="fa-solid fa-shirt"></i> Гардероб</h4>
                    <p class="hint" id="slay_wardrobe_hint">Загрузите аутфиты для бота и юзера. Словесное описание надетого добавляется в промпт <b>независимо от генерации картинок</b> — гардеробом можно пользоваться и с выключенной генерацией. Изображение активного аутфита отправляется как референс, когда генерация включена.</p>
                    <div class="flex-row"><div id="slay_sw_open_wardrobe" class="menu_button" style="width:100%;"><i class="fa-solid fa-shirt"></i> Открыть гардероб</div></div>
                    <label class="checkbox_label" style="margin-top:8px;"><input type="checkbox" id="slay_sw_auto_describe" ${swSettings.autoDescribe !== false ? 'checked' : ''}><span>Авто-описание аутфитов через ИИ</span></label>
                    <div id="slay_sw_describe_prompt_section" class="${swSettings.autoDescribe !== false ? '' : 'iig-hidden'}" style="margin-top:6px;">
                        <div class="flex-row"><label>Стиль описания</label><select id="slay_sw_describe_prompt_style" class="flex1"><option value="detailed" ${(swSettings.describePromptStyle || 'detailed') === 'detailed' ? 'selected' : ''}>Детальный (costume designer)</option><option value="simple" ${(swSettings.describePromptStyle || 'detailed') === 'simple' ? 'selected' : ''}>Простой (краткий)</option></select></div>
                    </div>

                    <div id="slay_sw_describe_api_section" class="${swSettings.autoDescribe !== false ? '' : 'iig-hidden'}" style="margin-top:8px;padding:12px;border-radius:10px;background:rgba(244,114,182,0.04);border:1px solid rgba(244,114,182,0.1);">
                        <div class="flex-row"><label>Способ</label><select id="slay_sw_describe_mode" class="flex1"><option value="direct" ${(swSettings.describeMode || 'direct') === 'direct' ? 'selected' : ''}>Прямой API</option><option value="chat" ${(swSettings.describeMode || 'direct') === 'chat' ? 'selected' : ''}>Через чат-API (расходует больше токенов)</option></select></div>

                        <div id="slay_sw_direct_api_section" class="${(swSettings.describeMode || 'direct') === 'direct' ? '' : 'iig-hidden'}">
                            <div class="flex-row" style="margin-top:6px;"><label>Формат API</label><select id="slay_sw_describe_api_format" class="flex1"><option value="auto" ${(swSettings.describeApiFormat || 'auto') === 'auto' ? 'selected' : ''}>Авто (по имени модели)</option><option value="gemini" ${swSettings.describeApiFormat === 'gemini' ? 'selected' : ''}>Gemini</option><option value="openai" ${swSettings.describeApiFormat === 'openai' ? 'selected' : ''}>OpenAI-compatible</option></select></div>
                            <div class="flex-row" style="margin-top:6px;"><label>Endpoint</label><input type="text" id="slay_sw_describe_endpoint" class="text_pole flex1" value="${sanitizeForHtml(swSettings.describeEndpoint || '')}" placeholder="Из основных настроек"></div>
                            <div class="flex-row" style="margin-top:6px;"><label>API Key</label><input type="password" id="slay_sw_describe_key" class="text_pole flex1" value="${sanitizeForHtml(swSettings.describeKey || '')}" placeholder="Из основных настроек"><div id="slay_sw_describe_key_toggle" class="menu_button iig-key-toggle" title="Show/Hide"><i class="fa-solid fa-eye"></i></div></div>
                            <div class="flex-row" style="margin-top:6px;"><label>Модель</label><select id="slay_sw_describe_model_select" class="text_pole flex1 ${swSettings.describeManualModel ? 'iig-hidden' : ''}"></select><input type="text" id="slay_sw_describe_model" class="text_pole flex1 ${swSettings.describeManualModel ? '' : 'iig-hidden'}" placeholder="название модели" value="${sanitizeForHtml(swSettings.describeModel || 'gemini-2.5-flash')}" autocomplete="off" spellcheck="false"><div id="slay_sw_describe_refresh" class="menu_button iig-refresh-btn" title="Обновить список"><i class="fa-solid fa-sync"></i></div></div>
                            <label class="checkbox_label" style="margin-top:2px;"><input type="checkbox" id="slay_sw_describe_manual" ${swSettings.describeManualModel ? 'checked' : ''}><span style="font-size:0.85em;opacity:0.85;">Ввести название модели вручную</span></label>
                            <div id="slay_sw_describe_test" class="menu_button iig-test-connection" style="margin-top:8px;"><i class="fa-solid fa-wifi"></i> Тест</div>
                            <p class="hint" style="margin-top:4px;">Оставьте Endpoint и API Key пустыми — будут использованы из основных настроек. Или укажите свои для отдельного подключения.</p>
                        </div>
                    </div>

                    <p class="hint" style="margin-top:10px;font-weight:600;color:var(--slay-pink,#f472b6);">Настройки гардероба:</p>
                    <label class="checkbox_label" style="margin-top:4px;"><input type="checkbox" id="slay_sw_send_outfit_desc" ${swSettings.sendOutfitDescription !== false ? 'checked' : ''}><span>Отправлять текстовое описание аутфита</span></label>
                    <label class="checkbox_label" style="margin-top:4px;"><input type="checkbox" id="slay_sw_send_outfit_image_bot" ${swSettings.sendOutfitImageBot !== false ? 'checked' : ''}><span>Отправлять картинку одежды бота</span></label>
                    <label class="checkbox_label" style="margin-top:4px;"><input type="checkbox" id="slay_sw_send_outfit_image_user" ${swSettings.sendOutfitImageUser !== false ? 'checked' : ''}><span>Отправлять картинку одежды юзера</span></label>
                    <label class="checkbox_label" style="margin-top:4px;"><input type="checkbox" id="slay_sw_collage" ${swSettings.experimentalCollage ? 'checked' : ''}><span>🧪 ЭКСПЕРИМЕНТАЛЬНО: склеивать отдельные куски одежды в коллаж (до 6 картинок, может работать некорректно)</span></label>
                    <label class="checkbox_label" style="margin-top:8px;"><input type="checkbox" id="slay_sw_skip_desc_warn" ${swSettings.skipDescriptionWarning ? 'checked' : ''}><span>Не спрашивать про описание при надевании</span></label>
                    <label class="checkbox_label" style="margin-top:4px;"><input type="checkbox" id="slay_sw_show_float" ${swSettings.showFloatingBtn ? 'checked' : ''}><span>Плавающая кнопка в чате</span></label>
                    <div class="flex-row" style="margin-top:6px;"><label>Макс. размер (px)</label><input type="number" id="slay_sw_max_dim" class="text_pole flex1" value="${swSettings.maxDimension || 512}" min="128" max="1024" step="64"></div>
                    <div class="flex-row" style="margin-top:6px;"><label>Размер гардероба (ПК)</label><select id="slay_sw_modal_width" class="flex1">
                        <option value="compact" ${swSettings.modalWidth === 'compact' ? 'selected' : ''}>Компактный (480px)</option>
                        <option value="normal" ${(swSettings.modalWidth || 'normal') === 'normal' ? 'selected' : ''}>Обычный (560px)</option>
                        <option value="wide" ${swSettings.modalWidth === 'wide' ? 'selected' : ''}>Широкий (800px)</option>
                        <option value="xwide" ${swSettings.modalWidth === 'xwide' ? 'selected' : ''}>Очень широкий (1100px)</option>
                        <option value="full" ${swSettings.modalWidth === 'full' ? 'selected' : ''}>Во весь экран</option>
                    </select></div>
                    <p class="hint" style="margin-top:4px;font-size:0.75em;">На мобильных устройствах всегда полноэкранный режим.</p>
                    <div class="flex-row" style="margin-top:10px;"><div id="slay_sw_find_orphans" class="menu_button" style="width:100%;"><i class="fa-solid fa-broom"></i> Найти ничьи картинки</div></div>
                    <p class="hint" style="margin-top:4px;font-size:0.75em;">Покажет, сколько картинок в папке гардероба не привязано ни к одной вещи, и предложит их удалить.</p>
                </div>

                </div>
                <!-- back inside the generation-only block -->
                <div id="slay_settings_body2" class="${settings.enabled ? '' : 'iig-hidden'}">
                <!-- Image context -->
                <div id="slay_image_context_section" class="iig-section">
                    <h4><i class="fa-solid fa-layer-group"></i> Контекст изображений</h4>
                    <label class="checkbox_label"><input type="checkbox" id="slay_image_context_enabled" ${settings.imageContextEnabled ? 'checked' : ''}><span>Отправлять предыдущие картинки как reference</span></label>
                    <div class="flex-row ${settings.imageContextEnabled ? '' : 'iig-hidden'}" id="slay_image_context_count_row"><label>Кол-во (макс ${MAX_CONTEXT_IMAGES})</label><input type="number" id="slay_image_context_count" class="text_pole flex1" value="${settings.imageContextCount}" min="1" max="${MAX_CONTEXT_IMAGES}"></div>
                </div>

                <!-- Naistera video -->
                <div id="slay_naistera_video_section" class="iig-section ${settings.apiType === 'naistera' ? '' : 'iig-hidden'}">
                    <h4><i class="fa-solid fa-video"></i> Видео (Naistera)</h4>
                    <label class="checkbox_label"><input type="checkbox" id="slay_naistera_video_test" ${settings.naisteraVideoTest ? 'checked' : ''}><span>Video test mode</span></label>
                    <div class="flex-row ${settings.naisteraVideoTest ? '' : 'iig-hidden'}" id="slay_naistera_video_frequency_row"><label>Каждые N сообщений</label><input type="number" id="slay_naistera_video_every_n" class="text_pole flex1" value="${settings.naisteraVideoEveryN}" min="1" max="999"></div>
                </div>
                <hr>

                <!-- Retry -->
                <div class="iig-section">
                    <h4><i class="fa-solid fa-rotate"></i> Повторы</h4>
                    <div class="flex-row"><label>Макс. повторов</label><input type="number" id="slay_max_retries" class="text_pole flex1" value="${settings.maxRetries}" min="0" max="5"></div>
                    <div class="flex-row"><label>Задержка (мс)</label><input type="number" id="slay_retry_delay" class="text_pole flex1" value="${settings.retryDelay}" min="500" max="10000" step="500"></div>
                </div>
                <hr>

                <!-- Debug -->
                <div class="iig-section">
                    <h4><i class="fa-solid fa-bug"></i> Отладка</h4>
                    <div id="slay_export_logs" class="menu_button"><i class="fa-solid fa-download"></i> Экспорт логов</div>
                </div>
                </div>
                <p class="hint iig-credit" style="text-align:center;opacity:0.5;margin-top:4px;line-height:1.55;">
                    v${SLAY_VERSION} by <a href="https://github.com/wewwaistyping" target="_blank" style="color:inherit;text-decoration:underline;">Wewwa</a>
                    · <a href="https://t.me/wewwajai" target="_blank" style="color:inherit;text-decoration:underline;">tg for support</a><br>
                    gallery update by <a href="https://github.com/hydall" target="_blank" style="color:inherit;text-decoration:underline;">hydall</a>
                    · based on sillyimages by <a href="https://github.com/0xl0cal/sillyimages" target="_blank" style="color:inherit;text-decoration:underline;">0xl0cal</a>,
                    wardrobe system by <a href="https://github.com/delidgi/sillyimages" target="_blank" style="color:inherit;text-decoration:underline;">delidgi</a>,
                    NPC system by <a href="https://github.com/aceeenvw/notsosillynotsoimages" target="_blank" style="color:inherit;text-decoration:underline;">aceeenvw</a><br>
                    <a href="https://github.com/wewwaistyping/SLAYimages" target="_blank" style="color:inherit;text-decoration:underline;">AGPL-3.0 · исходники</a>
                </p>
                <p id="slay_session_stats" class="hint" style="text-align:center;opacity:0.35;margin-top:2px;font-size:0.8em;"></p>
            </div>
        </div>
    </div>`;

    // Exactly one settings panel, always.
    // SillyTavern re-runs an extension's module when it hot-reloads it (dropping
    // new files into the folder does this), and APP_READY can fire more than
    // once — each run appended ANOTHER full panel. Two panels means two sets of
    // ref slots sharing the same ids, so querySelector answered with the first,
    // invisible one: portraits saved to settings but the thumbnail the user was
    // looking at never changed, and the "Куда применить?" list showed every NPC
    // twice. Worse, both popups get re-parented to <body> when first opened, so
    // they outlive their panel and pile up on screen with nothing able to close
    // the orphan. Clear all of it before building.
    for (const stale of container.querySelectorAll('.iig-settings')) {
        const drawer = stale.closest('.inline-drawer');
        if (drawer) drawer.remove(); else stale.remove();
    }
    for (const orphan of document.querySelectorAll('body > #slay_assign_popup, body > #slay_slot_options_popup, body > .iig-assign-popup, body > .iig-slot-options-popup')) {
        orphan.remove();
    }
    container.insertAdjacentHTML('beforeend', html);
    bindSettingsEvents();
    bindRefSlotEvents();
    renderRefSlots();
    renderRecentRefsRibbon();

    // Saved-character library: collapsed by default so it doesn't push the ref
    // slots down, but the counter on the button shows it has something in it.
    // Restore the panel's last state before anything else touches it.
    if (settings.savedOpen) {
        document.getElementById('slay_saved_portraits')?.classList.remove('iig-hidden');
        document.getElementById('slay_saved_toggle')?.classList.add('iig-saved-toggle-on');
    }
    const savedToggle = document.getElementById('slay_saved_toggle');
    savedToggle?.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const panel = document.getElementById('slay_saved_portraits');
        if (!panel) return;
        const willShow = panel.classList.contains('iig-hidden');
        panel.classList.toggle('iig-hidden', !willShow);
        savedToggle.classList.toggle('iig-saved-toggle-on', willShow);
        settings.savedOpen = willShow;
        saveSettings();
        if (willShow) renderSavedPortraits();
    });
    renderSavedPortraits();   // fills the counter even while collapsed
}

// Write saved path to the correct ref slot (char / user / NPC N) AND update its thumbnail in UI.
// Used by file upload, paste-from-clipboard, and click-to-assign from Recent ribbon.
function applyPathToSlot(slotEl, refType, npcIndex, savedPath) {
    const s = getCurrentCharacterRefs();
    if (refType === 'char') { s.charRef.imageBase64 = ''; s.charRef.imagePath = savedPath; }
    else if (refType === 'user') { s.userRef.imageBase64 = ''; s.userRef.imagePath = savedPath; }
    else if (refType === 'npc') {
        if (!s.npcReferences[npcIndex]) s.npcReferences[npcIndex] = { name: '', imageBase64: '', imagePath: '' };
        s.npcReferences[npcIndex].imageBase64 = '';
        s.npcReferences[npcIndex].imagePath = savedPath;
    }
    saveSettings();
    if (slotEl) {
        const thumb = slotEl.querySelector('.iig-ref-thumb'); if (thumb) thumb.src = savedPath;
        const tw = slotEl.querySelector('.iig-ref-thumb-wrap'); if (tw) tw.classList.add('has-image');
    }
}

// Write a name into a slot — settings AND the visible input, so the user sees
// it land. Mirrors the writeName() logic used by the name field's own handlers.
function applyNameToSlot(slotEl, refType, npcIndex, name) {
    const s = getCurrentCharacterRefs();
    if (refType === 'char') s.charRef.name = name;
    else if (refType === 'user') s.userRef.name = name;
    else if (refType === 'npc') {
        if (!s.npcReferences[npcIndex]) s.npcReferences[npcIndex] = { name: '', imageBase64: '', imagePath: '' };
        s.npcReferences[npcIndex].name = name;
    }
    saveSettings();
    const input = slotEl?.querySelector('.iig-ref-name');
    if (input) input.value = name;
}

// Every slot matching a ref key. Normally one; returns more only when a stale
// duplicate panel is still in the DOM, in which case updating all of them is
// what keeps the VISIBLE one correct.
function findAllSlotsByKey(key) {
    if (!key) return [];
    if (key === 'char' || key === 'user') {
        return [...document.querySelectorAll(`.iig-ref-slot[data-ref-type="${key}"]`)];
    }
    const m = key.match(/^npc-(\d+)$/);
    if (!m) return [];
    return [...document.querySelectorAll(`.iig-ref-slot[data-ref-type="npc"][data-npc-index="${m[1]}"]`)];
}

// Find slot DOM element by its "ref key" ("char" / "user" / "npc-0" / "npc-1" / ...)
function findSlotByKey(key) {
    if (!key) return null;
    if (key === 'char' || key === 'user') {
        return document.querySelector(`.iig-ref-slot[data-ref-type="${key}"]`);
    }
    const m = key.match(/^npc-(\d+)$/);
    if (m) return document.querySelector(`.iig-ref-slot[data-ref-type="npc"][data-npc-index="${m[1]}"]`);
    return null;
}

// ── v4.2 Recent Refs ribbon rendering ──
function renderRecentRefsRibbon() {
    const host = document.getElementById('slay_recent_refs_ribbon');
    if (!host) return;
    const items = getRecentRefs();
    if (items.length === 0) {
        host.innerHTML = '';
        host.classList.remove('has-items');
        return;
    }
    host.classList.add('has-items');
    let html = `<div class="iig-recent-refs-head">
        <span class="iig-recent-refs-title"><i class="fa-solid fa-clock-rotate-left"></i> Недавние</span>
        <span class="iig-recent-refs-hint">Tap → куда применить • drag на слот</span>
    </div>
    <div class="iig-recent-refs-track">`;
    for (const item of items) {
        const safeSrc = String(item.path).replace(/"/g, '&quot;');
        html += `<div class="iig-recent-thumb" draggable="true" data-path="${safeSrc}" title="${safeSrc}">
            <img src="${safeSrc}" alt="" loading="lazy">
            <button class="iig-recent-remove" title="Убрать из недавних" data-path="${safeSrc}">×</button>
        </div>`;
    }
    html += '</div>';
    host.innerHTML = html;
    bindRecentRefsEvents(host);
}

// Selection survives re-renders so relabelling doesn't collapse the strip the
// user is working in.
let _swSelChar = null, _swSelLook = null;

function renderSavedPortraits() {
    const host = document.getElementById('slay_saved_portraits');
    if (!host) return;
    const chars = getSavedChars();
    const countEl = document.getElementById('slay_saved_count');
    if (countEl) countEl.textContent = chars.length ? String(chars.length) : '';

    if (chars.length === 0) {
        host.innerHTML = `<div class="iig-saved-empty">
            Пока пусто. Нажмите на слот с картинкой → <b>дискета</b>, и персонаж окажется здесь —
            вместе с именами, чтобы в следующем чате не вписывать их заново.
        </div>`;
        return;
    }

    // Keep the selection pointing at something real after a delete or rename.
    const sel = chars.find(c => c.id === _swSelChar) || chars[0];
    _swSelChar = sel.id;
    const look = sel.looks.find(l => l.id === _swSelLook) || sel.looks[0];
    _swSelLook = look.id;

    const esc = sanitizeForHtml;
    const firstName = (n) => (swNameList(n)[0] || 'без имени');

    // Top row: one face per PERSON, not per picture. The row stays short even
    // when someone has six AUs behind them; the badge says how many.
    let html = `<div class="iig-recent-refs-head">
        <span class="iig-recent-refs-title"><i class="fa-solid fa-heart"></i> Сохранённые</span>
        <span class="iig-recent-refs-hint">персонаж → образ → слот</span>
    </div><div class="iig-people-row">`;
    for (const c of chars) {
        const cover = c.looks[0];
        html += `<div class="iig-person${c.id === sel.id ? ' on' : ''}" data-char="${esc(c.id)}" title="${esc(c.names)}" tabindex="0">
            <div class="iig-person-thumb"><img src="${esc(cover.path)}" alt="" loading="lazy"></div>
            ${c.looks.length > 1 ? `<span class="iig-person-badge">${c.looks.length}</span>` : ''}
            <div class="iig-person-name">${esc(firstName(c.names))}</div>
        </div>`;
    }
    html += `</div>`;

    // Expansion: everything about the selected person and nothing about anyone
    // else. Labels get real room here, which is why they can be read in full.
    html += `<div class="iig-look-panel">
        <div class="iig-look-head">
            <span class="iig-look-names">${esc(sel.names || 'без имени')}</span>
            <button class="iig-saved-btn iig-char-rename" title="Изменить имена"><i class="fa-solid fa-pen"></i></button>
            ${chars.length > 1 ? `<button class="iig-saved-btn iig-char-merge" title="\u041e\u0431\u044a\u0435\u0434\u0438\u043d\u0438\u0442\u044c \u0441 \u0434\u0440\u0443\u0433\u0438\u043c"><i class="fa-solid fa-code-merge"></i></button>` : ''}
        </div>
        <div class="iig-look-strip">`;
    for (const l of sel.looks) {
        html += `<div class="iig-look${l.id === look.id ? ' on' : ''}" data-look="${esc(l.id)}" title="${esc(l.label || 'без подписи')}" tabindex="0">
            <div class="iig-look-thumb"><img src="${esc(l.path)}" alt="" loading="lazy"></div>
            <div class="iig-look-label${l.label ? '' : ' iig-look-nolabel'}">${esc(l.label || '—')}</div>
        </div>`;
    }
    html += `<div class="iig-look-add" id="slay_add_look" tabindex="0" title="\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u043e\u0431\u0440\u0430\u0437 \u044d\u0442\u043e\u043c\u0443 \u043f\u0435\u0440\u0441\u043e\u043d\u0430\u0436\u0443">
            <i class="fa-solid fa-plus"></i><span>\u0435\u0449\u0451 \u043e\u0431\u0440\u0430\u0437</span>
        </div>`;
    html += `</div>
        <div class="iig-look-tools">
            <button class="iig-look-tool" data-act="crop"><i class="fa-solid fa-crop-simple"></i><span>Обрезать</span></button>
            <button class="iig-look-tool" data-act="replace"><i class="fa-solid fa-image"></i><span>Заменить</span></button>
            <button class="iig-look-tool" data-act="label"><i class="fa-solid fa-pen"></i><span>Подпись</span></button>
            <button class="iig-look-tool danger" data-act="remove"><i class="fa-solid fa-trash-can"></i><span>Убрать</span></button>
        </div>
        <div class="iig-look-assign">
            <span class="iig-look-assign-lbl">Поставить в:</span>
            <span class="iig-assign-chips" id="slay_look_slots"></span>
        </div>
    </div>`;

    host.innerHTML = html;

    // Slot buttons come from the DOM, so the NPC count always matches reality.
    const chips = host.querySelector('#slay_look_slots');
    if (chips) {
        const btns = [`<button class="iig-look-chip" data-key="char">{{char}}</button>`,
                      `<button class="iig-look-chip" data-key="user">{{user}}</button>`];
        const seen = new Set();
        document.querySelectorAll('.iig-ref-slot[data-ref-type="npc"]').forEach((sl, i) => {
            const idx = String(sl.dataset.npcIndex != null ? sl.dataset.npcIndex : i);
            if (seen.has(idx)) return;
            seen.add(idx);
            btns.push(`<button class="iig-look-chip" data-key="npc-${idx}">NPC ${Number(idx) + 1}</button>`);
        });
        chips.innerHTML = btns.join('');
    }

    for (const el of host.querySelectorAll('.iig-person')) {
        el.addEventListener('click', () => { _swSelChar = el.dataset.char; _swSelLook = null; renderSavedPortraits(); });
    }
    for (const el of host.querySelectorAll('.iig-look')) {
        el.addEventListener('click', (e) => {
            if (e.target.closest('.iig-look-acts')) return;
            _swSelLook = el.dataset.look; renderSavedPortraits();
        });
    }

    // Add a look straight from the library: pick a picture, label it, done. No
    // detour through a ref slot. Runs the same dedup as a normal ref upload, so
    // re-picking a file already in iig_refs reuses it instead of copying.
    host.querySelector('#slay_add_look')?.addEventListener('click', () => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*';
        inp.addEventListener('change', async () => {
            const file = inp.files && inp.files[0];
            if (!file) return;
            try {
                const loadingToast = toastr.info('\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u044e...', 'SLAY Images', { timeOut: 0, extendedTimeOut: 0 });
                let rawBase64 = await new Promise((res, rej) => {
                    const r = new FileReader();
                    r.onloadend = () => res(String(r.result).split(',')[1]);
                    r.onerror = rej;
                    r.readAsDataURL(file);
                });
                rawBase64 = await slayMaybeCrop(rawBase64, { aspect: 0, title: 'Обрезать образ', subtitle: 'Плитка образа — пропорции 3:4' });
                if (rawBase64 === null) { try { toastr.clear(loadingToast); } catch (_) {} return; }
                // Cheapest check first: the file's own name.
                let savedPath = await resolveExistingRefByFileName(file);
                const hashes = await computeRefHashes(rawBase64);
                if (!savedPath) savedPath = await lookupRefByHashes(hashes);
                if (savedPath) {
                    iigLog('INFO', 'add-look: reused existing ref, no copy written');
                } else {
                    const compressed = hashes.compressed || await compressBase64Image(rawBase64, 768, 0.8);
                    savedPath = await saveRefImageToFile(compressed, 'look', { skipDedupCheck: true });
                    recordRefHashes(hashes, savedPath);
                }
                // Dismiss the progress toast before the dialog opens, or it sits
                // on top of the very field the user is meant to type into.
                try { toastr.clear(loadingToast); } catch (_) { try { toastr.clear(); } catch (_) {} }
                const label = await slayPromptInput('\u041f\u043e\u0434\u043f\u0438\u0441\u044c \u043e\u0431\u0440\u0430\u0437\u0430 \u2014 \u0447\u0435\u043c \u044d\u0442\u043e\u0442 \u043e\u0442\u043b\u0438\u0447\u0430\u0435\u0442\u0441\u044f \u043e\u0442 \u043e\u0441\u0442\u0430\u043b\u044c\u043d\u044b\u0445 (\u041c\u0430\u0444\u0438\u044f, \u041a\u043e\u043b\u0434\u043e\u0432\u0441\u0442\u0432\u043e\u0440\u0435\u0446)', '');
                if (label === null) return;
                saveLook({ charId: sel.id, label: label.trim(), path: savedPath });
                _swSelLook = null;
                toastr.success(`${sel.names}${label.trim() ? ` \u2014 ${label.trim()}` : ''}`, 'SLAY Images', { timeOut: 2000 });
            } catch (err) {
                try { toastr.clear(); } catch (_) {}
                toastr.error('\u041e\u0448\u0438\u0431\u043a\u0430: ' + (err && err.message ? err.message : err), 'SLAY Images');
            }
        });
        // Safari only opens the picker for an input that is in the document.
        inp.style.display = 'none';
        document.body.appendChild(inp);
        inp.click();
        setTimeout(() => inp.remove(), 60000);
    });

    // Fold this character into another — for when the same person ended up in
    // the library twice under slightly different name lists.
    host.querySelector('.iig-char-merge')?.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        const others = chars.filter(c => c.id !== sel.id);
        if (!others.length) return;
        const ctx2 = SillyTavern.getContext();
        const wrap = document.createElement('div');
        wrap.style.cssText = 'text-align:left;display:flex;flex-direction:column;gap:6px;';
        wrap.innerHTML = `
            <div style="font-size:15px;font-weight:600;color:#f472b6;">\u041e\u0431\u044a\u0435\u0434\u0438\u043d\u0438\u0442\u044c</div>
            <div style="font-size:12px;opacity:.75;line-height:1.5;">\u041e\u0431\u0440\u0430\u0437\u044b <b>${sanitizeForHtml(sel.names)}</b> \u043f\u0435\u0440\u0435\u0435\u0434\u0443\u0442 \u043a \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u043c\u0443, \u0438\u043c\u0435\u043d\u0430 \u043e\u0431\u044a\u0435\u0434\u0438\u043d\u044f\u0442\u0441\u044f.</div>
            <div id="slk_merge_host"></div>`;
        const picker = swBuildCharPicker(others, { seed: '' });
        wrap.querySelector('#slk_merge_host').appendChild(picker.el);
        const CONFIRM = ctx2.POPUP_TYPE && ctx2.POPUP_TYPE.CONFIRM ? ctx2.POPUP_TYPE.CONFIRM : 2;
        const okd = await ctx2.callGenericPopup(wrap, CONFIRM);
        if (!okd || !picker.value) return;
        const targetId = picker.value;
        if (mergeSavedChars(sel.id, targetId)) {
            _swSelChar = targetId; _swSelLook = null;
            renderSavedPortraits();
            toastr.success('\u041e\u0431\u044a\u0435\u0434\u0438\u043d\u0435\u043d\u044b', 'SLAY Images', { timeOut: 1800 });
        }
    });

    host.querySelector('.iig-char-rename')?.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        const next = await slayPromptInput('Имена через запятую — по ним расширение узнаёт персонажа в промпте', sel.names || '');
        if (next !== null) renameSavedChar(sel.id, next.trim());
    });
    // All four act on the SELECTED look — the one the strip is highlighting.
    host.querySelector('.iig-look-tools')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('.iig-look-tool');
        if (!btn) return;
        e.preventDefault(); e.stopPropagation();
        const act = btn.dataset.act;

        if (act === 'crop') {
            const next = await slayRecropExisting(look.path, {
                title: 'Обрезать образ', subtitle: look.label || sel.names, label: 'look',
            });
            if (!next || next === look.path) return;
            look.path = next;
            saveSettings();
            renderSavedPortraits();
            toastr.success('Обрезано', 'SLAY Images', { timeOut: 1600 });
            return;
        }

        if (act === 'replace') {
            // Swap the picture, keep the label and the character it belongs to.
            const inp = document.createElement('input');
            inp.type = 'file'; inp.accept = 'image/*';
            inp.addEventListener('change', async () => {
                const file = inp.files && inp.files[0];
                if (!file) return;
                const t = toastr.info('Загружаю...', 'SLAY Images', { timeOut: 0, extendedTimeOut: 0 });
                try {
                    let raw = await new Promise((res, rej) => {
                        const r = new FileReader();
                        r.onloadend = () => res(String(r.result).split(',')[1]);
                        r.onerror = rej;
                        r.readAsDataURL(file);
                    });
                    raw = await slayMaybeCrop(raw, { title: 'Обрезать образ', subtitle: look.label || sel.names });
                    if (raw === null) { try { toastr.clear(t); } catch (_) {} return; }
                    // Same reuse-before-write path as every other upload, so
                    // picking a file already in iig_refs writes no second copy.
                    let saved = await resolveExistingRefByFileName(file);
                    const hashes = await computeRefHashes(raw);
                    if (!saved) saved = await lookupRefByHashes(hashes);
                    if (!saved) {
                        const payload = hashes.compressed || await compressBase64Image(raw, 768, 0.8);
                        saved = await saveRefImageToFile(payload, 'look', { skipDedupCheck: true });
                        recordRefHashes(hashes, saved);
                    }
                    const oldPath = look.path;
                    look.path = saved;
                    saveSettings();
                    try { toastr.clear(t); } catch (_) {}
                    renderSavedPortraits();
                    toastr.success(oldPath === saved ? 'Та же картинка' : 'Картинка заменена', 'SLAY Images', { timeOut: 1800 });
                } catch (err) {
                    try { toastr.clear(t); } catch (_) {}
                    toastr.error('Ошибка: ' + (err && err.message ? err.message : err), 'SLAY Images');
                }
            });
            // Safari only opens the picker for an input that is in the document.
            inp.style.display = 'none';
            document.body.appendChild(inp);
            inp.click();
            setTimeout(() => inp.remove(), 60000);
            return;
        }

        if (act === 'label') {
            const next = await slayPromptInput('Подпись образа — чем этот отличается от остальных (Мафия, Колдовстворец)', look.label || '');
            if (next !== null) relabelSavedLook(sel.id, look.id, next.trim());
            return;
        }

        if (act === 'remove') {
            const doomedPath = look.path;
            // How many places would still point at this file once the look is gone?
            const otherUses = slayCountPathUses(doomedPath) - 1;
            const last = sel.looks.length === 1;
            const head = last
                ? `Это последний образ «${sel.names}». Убрать его — значит убрать персонажа целиком.`
                : `Убрать образ «${look.label || 'без подписи'}»?`;
            const tail = otherUses > 0
                ? `\n\nКартинка останется на диске — её ${slayPlural(otherUses, 'использует', 'используют', 'используют')} ещё ${otherUses} ${slayPlural(otherUses, 'место', 'места', 'мест')} (другой образ, вещь гардероба или слот в другом чате).`
                : `\n\nБольше на эту картинку никто не ссылается — она будет удалена и с диска.`;
            if (!(await slayConfirm(head + tail))) return;
            _swSelLook = null;
            removeSavedLook(sel.id, look.id);
            if (otherUses <= 0) {
                const gone = await slayDeleteStoredImage(doomedPath);
                if (gone) toastr.info('Картинка удалена с диска', 'SLAY Images', { timeOut: 2000 });
            }
        }
    });

    // Assigning sends the LOOK's picture and the CHARACTER's names together —
    // that pairing is the entire point of the feature.
    for (const chip of host.querySelectorAll('.iig-look-chip')) {
        chip.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            const slots = findAllSlotsByKey(chip.dataset.key);
            if (!slots.length) return;
            const refType = slots[0].dataset.refType;
            const npcIndex = parseInt(slots[0].dataset.npcIndex, 10);
            for (const sl of slots) {
                applyPathToSlot(sl, refType, npcIndex, look.path);
                applyNameToSlot(sl, refType, npcIndex, sel.names);
            }
            pushRecentRef(look.path);
            const target = slots[slots.length - 1];
            target.classList.add('iig-slot-flash');
            setTimeout(() => target.classList.remove('iig-slot-flash'), 600);
            toastr.success(`${sel.names}${look.label ? ` — ${look.label}` : ''}`, 'SLAY Images', { timeOut: 1800 });
        });
    }
}

function bindRecentRefsEvents(host) {
    for (const thumb of host.querySelectorAll('.iig-recent-thumb')) {
        const path = thumb.dataset.path;
        // Click → assign popup
        thumb.addEventListener('click', (e) => {
            if (e.target.closest('.iig-recent-remove')) return;
            e.stopPropagation();
            showAssignPopup(e.currentTarget, path);
        });
        // Drag start
        thumb.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', path);
            e.dataTransfer.effectAllowed = 'copy';
            thumb.classList.add('dragging');
            window._iigRecentDragPath = path;
        });
        thumb.addEventListener('dragend', () => {
            thumb.classList.remove('dragging');
            window._iigRecentDragPath = null;
        });
    }
    for (const rm of host.querySelectorAll('.iig-recent-remove')) {
        rm.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            removeRecentRef(rm.dataset.path);
        });
    }
    // Drop targets = all ref slots
    for (const slot of document.querySelectorAll('.iig-ref-slot')) {
        if (slot.dataset.iigDropBound === '1') continue;
        slot.dataset.iigDropBound = '1';
        slot.addEventListener('dragover', (e) => { e.preventDefault(); slot.classList.add('iig-slot-drop-hover'); });
        slot.addEventListener('dragleave', () => slot.classList.remove('iig-slot-drop-hover'));
        slot.addEventListener('drop', (e) => {
            e.preventDefault();
            slot.classList.remove('iig-slot-drop-hover');
            const path = e.dataTransfer.getData('text/plain') || window._iigRecentDragPath;
            if (!path) return;
            const refType = slot.dataset.refType;
            const npcIndex = parseInt(slot.dataset.npcIndex, 10);
            applyPathToSlot(slot, refType, npcIndex, path);
            pushRecentRef(path);
            toastr.success('Реф применён', 'SLAY Images', { timeOut: 1500 });
        });
    }
}

// Prevent popup from being cut off at viewport edges — shift it back into view after show.
function clampPopupToViewport(popup) {
    if (!popup || !popup.classList.contains('show')) return;
    const rect = popup.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    let left = rect.left;
    let top = rect.top;
    if (rect.right > vw - margin) left = Math.max(margin, vw - rect.width - margin);
    if (rect.bottom > vh - margin) top = Math.max(margin, vh - rect.height - margin);
    if (left < margin) left = margin;
    if (top < margin) top = margin;
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
}

// Attach propagation-blockers on a popup so a click INSIDE it doesn't bubble up to
// SillyTavern's drawer handlers which would close the settings panel.
// BUBBLE phase only — if we used capture phase, our stopPropagation would cancel
// the target-phase click on the actual buttons inside the popup.
function armPopupContainment(popup) {
    if (!popup || popup.dataset.iigContainArmed === '1') return;
    popup.dataset.iigContainArmed = '1';
    const swallow = (e) => { e.stopPropagation(); };
    popup.addEventListener('mousedown', swallow);
    popup.addEventListener('click', swallow);
    popup.addEventListener('touchstart', swallow, { passive: true });
}

// Close both popups unconditionally — call after a successful pick
function closeAllRefPopups() {
    document.getElementById('slay_assign_popup')?.classList.remove('show');
    document.getElementById('slay_slot_options_popup')?.classList.remove('show');
}

// ── Assign popup ("Куда применить?") ──
// `name` is optional and only comes from the saved-character library: assigning
// a saved entry writes its comma-separated names into the slot as well, which is
// the half of the chore that used to be done by hand every single time.
function showAssignPopup(anchor, path, name = '') {
    const popup = document.getElementById('slay_assign_popup');
    if (!popup) return;
    // Toggle: same path + popup already open = close
    if (popup.classList.contains('show') && popup.dataset.path === path) {
        popup.classList.remove('show');
        return;
    }
    if (popup.parentElement !== document.body) document.body.appendChild(popup);
    armPopupContainment(popup);
    document.getElementById('slay_slot_options_popup')?.classList.remove('show');
    // Discover existing slots so button list matches current character's NPC count
    const slotButtons = [];
    slotButtons.push(`<button class="iig-assign-btn" data-key="char">{{char}}</button>`);
    slotButtons.push(`<button class="iig-assign-btn" data-key="user">{{user}}</button>`);
    // Dedupe by index: if a stale second panel is ever in the DOM, the same NPC
    // must not appear twice in this list.
    const seenNpc = new Set();
    document.querySelectorAll('.iig-ref-slot[data-ref-type="npc"]').forEach((slot, i) => {
        const idx = String(slot.dataset.npcIndex ?? i);
        if (seenNpc.has(idx)) return;
        seenNpc.add(idx);
        slotButtons.push(`<button class="iig-assign-btn" data-key="npc-${idx}">NPC ${Number(idx) + 1}</button>`);
    });
    popup.innerHTML = `
        <button class="iig-popup-close" type="button" title="Закрыть" aria-label="Закрыть"><i class="fa-solid fa-xmark"></i></button>
        <div class="iig-assign-title">Куда применить?${name ? ` <span style="opacity:.75;font-weight:400;">— ${sanitizeForHtml(name)}</span>` : ''}</div>
        <div class="iig-assign-preview"><img src="${String(path).replace(/"/g, '&quot;')}" alt=""></div>
        <div class="iig-assign-buttons">${slotButtons.join('')}</div>
    `;
    popup.querySelector('.iig-popup-close')?.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        closeAllRefPopups();
    });
    // Position below the clicked thumb — fixed position is viewport-relative, no scroll offset needed
    const rect = anchor.getBoundingClientRect();
    popup.style.left = rect.left + 'px';
    popup.style.top = (rect.bottom + 6) + 'px';
    popup.classList.add('show');
    popup.dataset.path = path;
    // After show, clamp position to viewport so popup doesn't get cut off on the right/bottom
    requestAnimationFrame(() => clampPopupToViewport(popup));
    // Flash effect for the target slot on assign
    for (const btn of popup.querySelectorAll('.iig-assign-btn')) {
        btn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            const key = btn.dataset.key;
            const slots = findAllSlotsByKey(key);
            if (!slots.length) { closeAllRefPopups(); return; }
            const refType = slots[0].dataset.refType;
            const npcIndex = parseInt(slots[0].dataset.npcIndex, 10);
            for (const sl of slots) {
                applyPathToSlot(sl, refType, npcIndex, path);
                if (name) applyNameToSlot(sl, refType, npcIndex, name);
            }
            const slot = slots[slots.length - 1];
            pushRecentRef(path);
            slot.classList.add('iig-slot-flash');
            setTimeout(() => slot.classList.remove('iig-slot-flash'), 600);
            closeAllRefPopups();
            toastr.success(name ? `Применён: ${name}` : 'Реф применён', 'SLAY Images', { timeOut: 1500 });
        });
    }
}

// ── Slot options popup ("Файл / Вставить / Недавние") when clicking an EMPTY slot ──
function showSlotOptionsPopup(slot) {
    const popup = document.getElementById('slay_slot_options_popup');
    if (!popup) return;
    // Toggle: if this same popup is already open for this exact slot — close it.
    const slotKey = `${slot.dataset.refType}-${slot.dataset.npcIndex ?? ''}`;
    if (popup.classList.contains('show') && popup.dataset.slotKey === slotKey) {
        popup.classList.remove('show');
        return;
    }
    popup.dataset.slotKey = slotKey;
    if (popup.parentElement !== document.body) document.body.appendChild(popup);
    armPopupContainment(popup);
    // Close any stale assign popup that might still be visible
    document.getElementById('slay_assign_popup')?.classList.remove('show');
    const refType = slot.dataset.refType;
    const npcIndex = parseInt(slot.dataset.npcIndex, 10);
    const targetLabel = refType === 'char' ? '{{char}}'
        : refType === 'user' ? '{{user}}'
        : `NPC ${Number.isFinite(npcIndex) ? npcIndex + 1 : '?'}`;
    popup.innerHTML = `
        <button class="iig-popup-close" type="button" title="Закрыть" aria-label="Закрыть"><i class="fa-solid fa-xmark"></i></button>
        <div class="iig-assign-title">Добавить в <span style="color:var(--slay-pink,#f472b6);">${targetLabel}</span></div>
        <div class="iig-slot-options-row">
            <button class="iig-slot-option-btn" data-act="file"><i class="fa-solid fa-folder-open"></i><span>Файл</span></button>
            <button class="iig-slot-option-btn" data-act="paste"><i class="fa-solid fa-clipboard"></i><span>Вставить</span></button>
            <button class="iig-slot-option-btn" data-act="recent"><i class="fa-solid fa-clock-rotate-left"></i><span>Недавние</span></button>
            <button class="iig-slot-option-btn" data-act="library"><i class="fa-solid fa-heart"></i><span>Сохранённые</span></button>
        </div>
    `;
    popup.querySelector('.iig-popup-close')?.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        closeAllRefPopups();
    });
    const rect = slot.getBoundingClientRect();
    popup.style.left = rect.left + 'px';
    popup.style.top = (rect.bottom + 6) + 'px';
    popup.classList.add('show');
    requestAnimationFrame(() => clampPopupToViewport(popup));

    popup.querySelector('[data-act="file"]').addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        closeAllRefPopups();
        const fileInput = slot.querySelector('.iig-ref-file-input');
        if (fileInput) fileInput.click();
    });
    popup.querySelector('[data-act="paste"]').addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        closeAllRefPopups();
        await pasteFromClipboardToSlot(slot);
    });
    popup.querySelector('[data-act="recent"]').addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        closeAllRefPopups();
        const ribbon = document.getElementById('slay_recent_refs_ribbon');
        if (ribbon) {
            ribbon.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            ribbon.classList.add('iig-recent-highlight');
            setTimeout(() => ribbon.classList.remove('iig-recent-highlight'), 1500);
        }
    });
    // Open the saved-character library and scroll to it.
    popup.querySelector('[data-act="library"]')?.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        closeAllRefPopups();
        openSavedPortraits({ scroll: true });
    });
}

// Show the library panel (and optionally scroll it into view).
function openSavedPortraits({ scroll = false } = {}) {
    const panel = document.getElementById('slay_saved_portraits');
    if (!panel) return;
    panel.classList.remove('iig-hidden');
    document.getElementById('slay_saved_toggle')?.classList.add('iig-saved-toggle-on');
    try { const st = getSettings(); st.savedOpen = true; saveSettings(); } catch (_) {}
    renderSavedPortraits();
    if (scroll) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        panel.classList.add('iig-recent-highlight');
        setTimeout(() => panel.classList.remove('iig-recent-highlight'), 1500);
    }
}

// Paste image from clipboard → upload → apply to slot
async function pasteFromClipboardToSlot(slot) {
    try {
        if (!navigator.clipboard || !navigator.clipboard.read) {
            toastr.error('Браузер не поддерживает чтение буфера обмена', 'SLAY Images');
            return;
        }
        const items = await navigator.clipboard.read();
        let blob = null;
        for (const item of items) {
            const imgType = item.types.find(t => t.startsWith('image/'));
            if (imgType) { blob = await item.getType(imgType); break; }
        }
        if (!blob) {
            toastr.warning('В буфере нет картинки', 'SLAY Images', { timeOut: 2500 });
            return;
        }
        let rawBase64 = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onloadend = () => res(String(r.result).split(',')[1]);
            r.onerror = rej;
            r.readAsDataURL(blob);
        });
        rawBase64 = await slayMaybeCrop(rawBase64, { aspect: 0, title: 'Обрезать реф', subtitle: 'Вставлено из буфера обмена' });
        if (rawBase64 === null) return;
        const hashes = await computeRefHashes(rawBase64);
        const refType = slot.dataset.refType;
        const npcIndex = parseInt(slot.dataset.npcIndex, 10);
        const cached = await lookupRefByHashes(hashes);
        if (cached) {
            applyPathToSlot(slot, refType, npcIndex, cached);
            pushRecentRef(cached);
            toastr.success('Вставлено (из кеша, дубликат не создан)', 'SLAY Images', { timeOut: 1800 });
            return;
        }
        const compressed = hashes.compressed || await compressBase64Image(rawBase64, 768, 0.8);
        const label = refType === 'npc' ? `npc${npcIndex}` : refType;
        const savedPath = await saveRefImageToFile(compressed, label, { skipDedupCheck: true });
        recordRefHashes(hashes, savedPath);
        applyPathToSlot(slot, refType, npcIndex, savedPath);
        pushRecentRef(savedPath);
        toastr.success('Вставлено из буфера', 'SLAY Images', { timeOut: 1800 });
    } catch (err) {
        iigLog('ERROR', `Paste from clipboard failed: ${err?.message}`);
        toastr.error(`Вставка не удалась: ${err?.message || 'ошибка'}`, 'SLAY Images');
    }
}

// Close popups on outside click — bubble phase. Inner button handlers run first in target phase,
// then armPopupContainment stops propagation, so this body-level handler only sees clicks OUTSIDE popups.
document.addEventListener('click', (e) => {
    const t = e.target;
    const insideAssign = t.closest('.iig-assign-popup') || t.closest('.iig-recent-thumb');
    const insideOptions = t.closest('.iig-slot-options-popup') || t.closest('.iig-ref-thumb-wrap') || t.closest('.iig-ref-upload-btn');
    if (!insideAssign) document.getElementById('slay_assign_popup')?.classList.remove('show');
    if (!insideOptions) document.getElementById('slay_slot_options_popup')?.classList.remove('show');
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllRefPopups();
});

// Both popups are position:fixed and anchored to a slot's on-screen rect, so the
// moment anything scrolls they detach from what they belong to and just hover
// over unrelated content — with no obvious way to get rid of them. Dismiss on
// any scroll or resize instead of trying to re-anchor them: the user was reaching
// for something else anyway. Capture phase so inner scroll containers count too.
(function bindPopupAutoDismiss() {
    let armed = false;
    const dismiss = () => {
        const a = document.getElementById('slay_assign_popup');
        const o = document.getElementById('slay_slot_options_popup');
        if (!a?.classList.contains('show') && !o?.classList.contains('show')) return;
        closeAllRefPopups();
    };
    const arm = () => {
        if (armed) return;
        armed = true;
        window.addEventListener('scroll', dismiss, { capture: true, passive: true });
        window.addEventListener('resize', dismiss, { passive: true });
    };
    arm();
})();

function bindRefSlotEvents() {
    for (const slot of document.querySelectorAll('.iig-ref-slot')) {
        const refType = slot.dataset.refType;
        const npcIndex = parseInt(slot.dataset.npcIndex, 10);

        // Floppy in the thumbnail corner: save this slot's portrait + names into
        // the library. Lives on the slot rather than in the options popup — that
        // popup is about FILLING a slot, and a fifth button no longer fitted.
        // Re-crop whatever is already in this slot.
        slot.querySelector('.iig-ref-crop-btn')?.addEventListener('click', async (e) => {
            e.preventDefault(); e.stopPropagation();
            const st = getCurrentCharacterRefs();
            const ref = refType === 'char' ? st.charRef
                : refType === 'user' ? st.userRef
                : (st.npcReferences[npcIndex] || null);
            const path = ref && ref.imagePath ? ref.imagePath : '';
            if (!path) { toastr.warning('В этом слоте нет картинки', 'SLAY Images'); return; }
            const next = await slayRecropExisting(path, {
                aspect: 0,
                title: 'Обрезать реф',
                subtitle: (ref && ref.name) || '',
                label: refType === 'npc' ? `npc${npcIndex}` : refType,
            });
            if (!next || next === path) return;
            applyPathToSlot(slot, refType, npcIndex, next);
            pushRecentRef(next);
            toastr.success('Обрезано', 'SLAY Images', { timeOut: 1600 });
        });

        slot.querySelector('.iig-ref-save-btn')?.addEventListener('click', async (e) => {
            e.preventDefault(); e.stopPropagation();   // must not open the slot popup
            const st = getCurrentCharacterRefs();
            const ref = refType === 'char' ? st.charRef
                : refType === 'user' ? st.userRef
                : (st.npcReferences[npcIndex] || null);
            const path = ref && ref.imagePath ? ref.imagePath : '';
            if (!path) { toastr.warning('\u0412 \u044d\u0442\u043e\u043c \u0441\u043b\u043e\u0442\u0435 \u043d\u0435\u0442 \u043a\u0430\u0440\u0442\u0438\u043d\u043a\u0438', 'SLAY Images'); return; }
            const res = await slayPromptSaveLook((ref && ref.name) || '', path);
            if (!res) return;
            const ch = saveLook({ charId: res.charId, names: res.names, label: res.label, path });
            if (ch) { _swSelChar = ch.id; _swSelLook = null; }
            openSavedPortraits({ scroll: true });
            toastr.success(ch ? `${ch.names}${res.label ? ` \u2014 ${res.label}` : ''}` : '\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u043e', 'SLAY Images', { timeOut: 2200 });
        });
        // Name input persistence — write to settings on every keystroke AND force a sync save
        // on blur/change. Debounced save alone was losing the last characters when users typed
        // quickly and then switched to another slot or closed the panel.
        const nameInput = slot.querySelector('.iig-ref-name');
        const writeName = (value) => {
            const s = getCurrentCharacterRefs();
            if (refType === 'char') s.charRef.name = value;
            else if (refType === 'user') s.userRef.name = value;
            else if (refType === 'npc') {
                if (!s.npcReferences[npcIndex]) s.npcReferences[npcIndex] = { name: '', imageBase64: '', imagePath: '' };
                s.npcReferences[npcIndex].name = value;
            }
        };
        if (nameInput) {
            nameInput.addEventListener('input', (e) => { writeName(e.target.value); saveSettings(); });
            // Blur/change/Enter write the name once more. There used to be a
            // second call here to a context method named saveSettings, added to
            // force an immediate flush — but the context exposes only
            // saveSettingsDebounced, so `?.` swallowed it and nothing happened.
            // saveSettings() below covers it anyway: it writes the localStorage
            // backup synchronously, which is what actually survives a killed tab.
            const flush = (e) => {
                writeName(e.target.value);
                saveSettings();
            };
            nameInput.addEventListener('change', flush);
            nameInput.addEventListener('blur', flush);
            nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { flush(e); nameInput.blur(); } });
        }
        const fileHandler = async (e) => {
            const file = e.target.files?.[0]; if (!file) return;
            try {
                let rawBase64 = await new Promise((res, rej) => { const r = new FileReader(); r.onloadend = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });
                // Crop BEFORE hashing: the cropped bytes are what gets stored, so
                // they must be what the dedup index remembers.
                rawBase64 = await slayMaybeCrop(rawBase64, { aspect: 0, title: 'Обрезать реф', subtitle: 'Слот показывает картинку в пропорциях 3:4' });
                if (rawBase64 === null) { e.target.value = ''; return; }
                // Compute BOTH hashes (byte for exact match, pixel for "same image re-encoded differently")
                const hashes = await computeRefHashes(rawBase64);
                // A file picked straight out of iig_refs is already ours — match
                // it by name before falling back to content hashing, which can
                // only recognise refs saved after we began hashing stored bytes.
                const cached = (await resolveExistingRefByFileName(file)) || await lookupRefByHashes(hashes);
                if (cached) {
                    applyPathToSlot(slot, refType, npcIndex, cached);
                    pushRecentRef(cached);
                    toastr.success('Реф применён из кеша (дубликат не создан)', 'SLAY Images', { timeOut: 2000 });
                    e.target.value = '';
                    return;
                }
                const compressed = hashes.compressed || await compressBase64Image(rawBase64, 768, 0.8);
                const label = refType === 'npc' ? `npc${npcIndex}` : refType;
                const savedPath = await saveRefImageToFile(compressed, label, { skipDedupCheck: true });
                recordRefHashes(hashes, savedPath);
                applyPathToSlot(slot, refType, npcIndex, savedPath);
                pushRecentRef(savedPath);
                toastr.success('Фото сохранено', 'SLAY Images', { timeOut: 2000 });
            } catch (err) {
                iigLog('ERROR', `fileHandler: ${err?.message}`);
                toastr.error(err?.message || 'Ошибка загрузки фото', 'SLAY Images', { timeOut: 6000 });
            }
            e.target.value = '';
        };
        for (const fi of slot.querySelectorAll('.iig-ref-file-input')) fi.addEventListener('change', fileHandler);

        // v4.2: click on thumb-wrap (the camera icon area) always opens the options popup,
        // whether the slot is empty or already has a picture. Useful for replacing via paste/recent
        // without having to open file picker first. <label> removed from HTML earlier so no
        // native label→input trigger competes with us.
        const thumbWrap = slot.querySelector('.iig-ref-thumb-wrap');
        if (thumbWrap) {
            thumbWrap.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                showSlotOptionsPopup(slot);
            });
        }
        // Upload button in .iig-ref-actions (sidebar, "Upload" label) — ALWAYS goes straight to
        // the native file picker, regardless of whether the slot is empty or already filled.
        // Users who want Paste or Recent use the camera icon on the thumbnail itself (popup).
        for (const btn of slot.querySelectorAll('.iig-ref-upload-btn')) {
            btn.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                const fileInput = slot.querySelector('.iig-ref-file-input');
                if (fileInput) fileInput.click();
            });
        }
        slot.querySelector('.iig-ref-delete-btn')?.addEventListener('click', () => {
            const s = getCurrentCharacterRefs();
            if (refType === 'char') s.charRef = { name: '', imageBase64: '', imagePath: '' };
            else if (refType === 'user') s.userRef = { name: '', imageBase64: '', imagePath: '' };
            else if (refType === 'npc') s.npcReferences[npcIndex] = { name: '', imageBase64: '', imagePath: '' };
            saveSettingsNow();
            const thumb = slot.querySelector('.iig-ref-thumb'); if (thumb) thumb.src = '';
            const tw = slot.querySelector('.iig-ref-thumb-wrap'); if (tw) tw.classList.remove('has-image');
            slot.querySelector('.iig-ref-name').value = '';
            toastr.info('Слот очищен', 'SLAY Images', { timeOut: 2000 });
        });
    }
}

// Bumped alongside manifest.json — used to invalidate style cache when parse format changes
const STYLE_CACHE_EXT_VERSION = SLAY_VERSION;
const STYLE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h fallback when ETag isn't supported

async function openStylePickerModal() {
    const BASE = 'https://wewwaistyping.github.io/slayimagespromts/';

    const overlay = document.createElement('div');
    overlay.className = 'slay-style-overlay';
    overlay.innerHTML = `
      <div class="slay-style-modal">
        <div class="slay-style-modal-head">
          <span class="slay-style-modal-title"><i class="fa-solid fa-palette"></i> Выбрать стиль</span>
          <a class="slay-style-source-link" href="${BASE}" target="_blank" rel="noopener" title="Открыть на сайте">
            <i class="fa-solid fa-arrow-up-right-from-square"></i> Сайт
          </a>
          <div class="slay-style-refresh menu_button" title="Обновить стили с сайта"><i class="fa-solid fa-rotate"></i></div>
          <div class="slay-style-modal-close menu_button"><i class="fa-solid fa-xmark"></i></div>
        </div>
        <div class="slay-style-filters"></div>
        <div class="slay-style-body"><div class="slay-style-loading">Загрузка стилей…</div></div>
      </div>`;
    document.body.appendChild(overlay);
    const modal = overlay.querySelector('.slay-style-modal');
    const closeOverlay = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        overlay.remove();
    };

    overlay.querySelector('.slay-style-modal-close').addEventListener('click', closeOverlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeOverlay(e); });
    overlay.addEventListener('mousedown', e => {
        if (e.target === overlay) {
            e.preventDefault();
            e.stopPropagation();
        }
    });
    modal?.addEventListener('click', e => e.stopPropagation());
    modal?.addEventListener('mousedown', e => e.stopPropagation());
    // Mobile: ST's extensions drawer closes on outside touch/pointer events, which fire
    // before/after the synthesized click. Eat them at the modal boundary so they never
    // bubble to the drawer (prevents "tap a style → drawer closes" regression).
    modal?.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
    modal?.addEventListener('touchend', e => e.stopPropagation(), { passive: true });
    modal?.addEventListener('pointerdown', e => e.stopPropagation());
    modal?.addEventListener('pointerup', e => e.stopPropagation());

    // ── Lightbox ──
    const openLightbox = (src) => {
        const lb = document.getElementById('slay_lightbox');
        if (!lb) return;
        lb.querySelector('.iig-lightbox-img').src = src;
        lb.querySelector('.iig-lightbox-caption').textContent = '';
        lb.classList.add('open');
        lb.dispatchEvent(new Event('slay-lightbox-open'));   // reset any leftover zoom
        document.body.style.overflow = 'hidden';
    };

    // Cache structure: { v, styles, etag, lastModified, ts }
    //   v = extension version at time of cache (invalidates on extension upgrade)
    //   ts = cache creation timestamp (for TTL fallback when ETag isn't available)
    const CACHE_KEY = 'slay_styles_cache_v2';
    let styles = [];

    const parseStyles = (html) => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const result = [];
        for (const card of doc.querySelectorAll('article.style-card')) {
            const name = card.querySelector('h2.card-title')?.textContent.trim() || '';
            const tags = (card.dataset.tags || '').split(',').map(t => t.trim()).filter(Boolean);
            const descEl = card.querySelector('p.card-desc');
            const desc = (descEl?.getAttribute('data-ru') || descEl?.textContent || '').trim();
            const images = [...card.querySelectorAll('.carousel-track img')]
                .map(img => { const r = img.getAttribute('src') || ''; return r ? new URL(r, BASE).href : ''; })
                .filter(Boolean);
            const stableBadge = card.querySelector('.badge-green');
            const expBadge = card.querySelector('.badge-yellow');
            const stability = stableBadge ? 'stable' : (expBadge ? 'exp' : '');
            const stabilityText = stableBadge
                ? (stableBadge.getAttribute('data-ru') || stableBadge.textContent).trim()
                : expBadge ? (expBadge.getAttribute('data-ru') || expBadge.textContent).trim() : '';
            const promptRaw = card.querySelector('.prompt-panel[data-panel="direct"] .prompt-code')?.textContent.trim() || '';
            const prompt = promptRaw.replace(/^\[Describe your scene here\]\.\s*/i, '').trim();
            if (name && prompt) result.push({ name, tags, desc, images, stability, stabilityText, prompt });
        }
        return result;
    };

    const readCache = () => {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            // Invalidate cache from a different extension version (parser format may have changed)
            if (parsed?.v !== STYLE_CACHE_EXT_VERSION) return null;
            if (!Array.isArray(parsed.styles)) return null;
            return parsed;
        } catch (e) { return null; }
    };

    const writeCache = (obj) => {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ v: STYLE_CACHE_EXT_VERSION, ...obj })); } catch (e) { }
    };

    // Fetch with conditional headers. Resolves to {status, styles, etag, lastModified} where:
    //   status = 'notmodified' (304 — nothing to do)
    //           | 'updated'    (200 — new styles parsed)
    //           | 'error'      (network error)
    const fetchStyles = async (cached, { force = false } = {}) => {
        const headers = {};
        if (!force && cached?.etag) headers['If-None-Match'] = cached.etag;
        if (!force && cached?.lastModified) headers['If-Modified-Since'] = cached.lastModified;
        try {
            const resp = await fetch(BASE, { headers });
            if (resp.status === 304) return { status: 'notmodified' };
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const html = await resp.text();
            const parsedStyles = parseStyles(html);
            return {
                status: 'updated',
                styles: parsedStyles,
                etag: resp.headers.get('ETag') || '',
                lastModified: resp.headers.get('Last-Modified') || '',
            };
        } catch (err) {
            return { status: 'error', error: err };
        }
    };

    const bodyEl = overlay.querySelector('.slay-style-body');
    const cached = readCache();
    const cacheAge = cached ? Date.now() - (cached.ts || 0) : Infinity;
    const cacheFresh = cached && cacheAge < STYLE_CACHE_TTL_MS;

    // Strategy:
    //   1. If we have any valid cache — show it immediately (stale-while-revalidate).
    //   2. Fetch in the background with If-None-Match to detect real site changes.
    //   3. If 304 — do nothing. If updated — replace grid with new data + toast.
    //   4. If no cache at all — fetch foreground, show loading state.
    let backgroundRefresh = null;

    if (cached) {
        styles = cached.styles;
        iigLog('INFO', `Styles loaded from cache: ${styles.length}, age=${Math.round(cacheAge/1000)}s`);
        // If cache is stale (>24h) or just always — background-validate with ETag.
        backgroundRefresh = fetchStyles(cached, { force: !cacheFresh });
    } else {
        // No cache — must fetch foreground
        const result = await fetchStyles(null, { force: true });
        if (result.status === 'updated') {
            styles = result.styles;
            writeCache({ styles, etag: result.etag, lastModified: result.lastModified, ts: Date.now() });
        } else {
            const msg = result.error?.message || 'неизвестная ошибка';
            bodyEl.innerHTML = `<p style="padding:16px;opacity:.6;">Ошибка загрузки: ${msg}</p>`;
            return;
        }
    }

    const allTags = [...new Set(styles.flatMap(s => s.tags))];
    const TAG_LABELS = { painting: 'Живопись', illustration: 'Иллюстрация', film: 'Кино/фото', game: 'Игры', cartoon: 'Мульты', anime: 'Аниме', print: 'Графика', '3d': '3D' };
    let activeTag = '';

    const filtersEl = overlay.querySelector('.slay-style-filters');
    // bodyEl is declared in the cache block above — reused here

    const renderFilters = () => {
        filtersEl.innerHTML = ['', ...allTags].map(t =>
            `<button class="slay-style-chip${activeTag === t ? ' active' : ''}" data-tag="${t}">${t ? (TAG_LABELS[t] || t) : 'Все'}</button>`
        ).join('');
        for (const btn of filtersEl.querySelectorAll('.slay-style-chip')) {
            btn.addEventListener('click', () => { activeTag = btn.dataset.tag; renderFilters(); renderGrid(); });
        }
    };

    const settings = getSettings();

    // Build carousel HTML for a list of image URLs
    const makeCarousel = (images) => {
        if (!images || !images.length) {
            return `<div class="slay-sc-carousel slay-sc-no-media"><i class="fa-solid fa-image"></i></div>`;
        }
        const imgs = images.map((src, i) =>
            // Lazy for all of them: the catalogue has dozens of cards and eagerly
            // fetching the first preview of each meant downloading pictures for
            // rows the user may never scroll to.
            `<img class="slay-sc-cimg" src="${src}" alt="" loading="lazy" data-src="${src}">`
        ).join('');
        const dots = images.length > 1
            ? `<div class="slay-sc-dots">${images.map((_, i) => `<span class="slay-sc-dot${i === 0 ? ' active' : ''}"></span>`).join('')}</div>`
            : '';
        const nav = images.length > 1
            ? `<button class="slay-sc-prev" type="button" aria-label="Назад">&#8249;</button>
               <button class="slay-sc-next" type="button" aria-label="Вперёд">&#8250;</button>
               <span class="slay-sc-counter">1 / ${images.length}</span>`
            : '';
        return `<div class="slay-sc-carousel" data-idx="0" data-total="${images.length}">
          <div class="slay-sc-track">${imgs}</div>
          ${nav}${dots}
        </div>`;
    };

    const makeCard = (s, isSel, isNoReplace) => {
        const encodedPrompt = s ? encodeURIComponent(s.prompt) : '';
        const encodedName = s ? encodeURIComponent(s.name) : '';
        if (isNoReplace) {
            return `<article class="slay-sc${isSel ? ' selected' : ''}">
              <div class="slay-sc-carousel slay-sc-no-media"><i class="fa-solid fa-ban"></i></div>
              <div class="slay-sc-body slay-sc-selectable" data-style="" data-name="">
                <div class="slay-sc-head"><span class="slay-sc-name">Не заменять</span></div>
                <p class="slay-sc-desc">Использовать стиль из оригинального промпта</p>
              </div>
            </article>`;
        }
        const badgeCls = s.stability === 'stable' ? 'slay-sc-badge-stable' : (s.stability === 'exp' ? 'slay-sc-badge-exp' : '');
        const badgeHtml = s.stabilityText ? `<span class="slay-sc-badge ${badgeCls}">${sanitizeForHtml(s.stabilityText)}</span>` : '';
        return `<article class="slay-sc${isSel ? ' selected' : ''}">
          ${makeCarousel(s.images)}
          <div class="slay-sc-body slay-sc-selectable" data-style="${encodedPrompt}" data-name="${encodedName}">
            <div class="slay-sc-head">
              <span class="slay-sc-name">${sanitizeForHtml(s.name)}</span>
              ${badgeHtml}
            </div>
            ${s.desc ? `<p class="slay-sc-desc">${sanitizeForHtml(s.desc)}</p>` : ''}
          </div>
        </article>`;
    };

    // Attach carousel logic to all .slay-sc-carousel elements inside a container
    const initCarousels = (container) => {
        for (const car of container.querySelectorAll('.slay-sc-carousel[data-total]')) {
            const total = parseInt(car.dataset.total, 10);
            if (total <= 1) continue;
            const track = car.querySelector('.slay-sc-track');
            const dots = car.querySelectorAll('.slay-sc-dot');
            const counter = car.querySelector('.slay-sc-counter');
            let idx = 0;

            const goTo = (n) => {
                idx = (n + total) % total;
                track.style.transform = `translateX(-${idx * 100}%)`;
                dots.forEach((d, i) => d.classList.toggle('active', i === idx));
                if (counter) counter.textContent = `${idx + 1} / ${total}`;
                car.dataset.idx = idx;
            };

            car.querySelector('.slay-sc-prev').addEventListener('click', e => { e.stopPropagation(); goTo(idx - 1); });
            car.querySelector('.slay-sc-next').addEventListener('click', e => { e.stopPropagation(); goTo(idx + 1); });

            // Touch swipe
            let touchX = null;
            track.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
            track.addEventListener('touchend', e => {
                if (touchX === null) return;
                const dx = e.changedTouches[0].clientX - touchX;
                if (Math.abs(dx) > 40) goTo(dx < 0 ? idx + 1 : idx - 1);
                touchX = null;
            });
        }

        // Lightbox on image click
        for (const img of container.querySelectorAll('.slay-sc-cimg')) {
            img.addEventListener('click', e => { e.stopPropagation(); openLightbox(img.dataset.src || img.src); });
        }
    };

    const renderGrid = () => {
        const visible = activeTag ? styles.filter(s => s.tags.includes(activeTag)) : styles;
        const noReplaceActive = !settings.slayStyle;
        bodyEl.innerHTML = `<div class="slay-style-grid">
          ${makeCard(null, noReplaceActive, true)}
          ${visible.map(s => makeCard(s, settings.slayStyle === s.prompt, false)).join('')}
        </div>`;

        initCarousels(bodyEl);

        // Select on body/description click only
        for (const selectable of bodyEl.querySelectorAll('.slay-sc-selectable')) {
            selectable.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                const prompt = selectable.dataset.style ? decodeURIComponent(selectable.dataset.style) : '';
                const name = selectable.dataset.name ? decodeURIComponent(selectable.dataset.name) : '';
                settings.slayStyle = prompt;
                settings.slayStyleName = name || 'Не заменять';
                saveSettings();
                const nameEl = document.getElementById('slay_style_name');
                if (nameEl) nameEl.textContent = settings.slayStyleName;
                // Defer overlay teardown: if we remove it synchronously during the click,
                // the following touchend/pointerup lands on whatever was behind the overlay
                // (the ST extensions drawer backdrop), which interprets the tap as "outside
                // click" and closes itself. One tick of delay lets the full click sequence
                // finish against the modal before the overlay goes away.
                setTimeout(() => closeOverlay(), 0);
            });
        }
    };

    renderFilters();
    renderGrid();

    // Apply a freshly-fetched style set: update caches, re-derive tags, re-render UI
    const applyFreshStyles = (result, { silent = false } = {}) => {
        if (!result || result.status !== 'updated') return;
        const oldCount = styles.length;
        styles = result.styles;
        writeCache({ styles, etag: result.etag, lastModified: result.lastModified, ts: Date.now() });
        // Re-derive tag list (new styles might add new categories)
        const newTags = [...new Set(styles.flatMap(s => s.tags))];
        allTags.length = 0;
        allTags.push(...newTags);
        renderFilters();
        renderGrid();
        if (!silent) {
            const delta = styles.length - oldCount;
            const msg = delta > 0 ? `Стили обновлены (+${delta})` : delta < 0 ? `Стили обновлены (${delta})` : 'Стили обновлены';
            if (typeof toastr !== 'undefined') toastr.success(msg, 'SLAY Images', { timeOut: 2500 });
        }
    };

    // Wait for background refresh (if any) and quietly apply if the site changed
    if (backgroundRefresh) {
        backgroundRefresh.then(result => {
            if (!overlay.isConnected) {
                // Modal was closed — still write cache silently
                if (result.status === 'updated') {
                    writeCache({ styles: result.styles, etag: result.etag, lastModified: result.lastModified, ts: Date.now() });
                }
                return;
            }
            if (result.status === 'notmodified') {
                iigLog('INFO', 'Style cache validated via ETag — no changes on site');
            } else if (result.status === 'updated') {
                applyFreshStyles(result);
            } else if (result.status === 'error') {
                iigLog('WARN', `Background style refresh failed: ${result.error?.message || 'unknown'}`);
            }
        });
    }

    // Manual refresh button — force fetch, ignore ETag
    const refreshBtn = overlay.querySelector('.slay-style-refresh');
    refreshBtn?.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        if (refreshBtn.classList.contains('is-loading')) return;
        refreshBtn.classList.add('is-loading');
        const icon = refreshBtn.querySelector('i');
        const origClass = icon.className;
        icon.className = 'fa-solid fa-spinner iig-spin-anim';
        try {
            const result = await fetchStyles(null, { force: true });
            if (result.status === 'updated') {
                applyFreshStyles(result, { silent: false });
            } else if (result.status === 'error') {
                if (typeof toastr !== 'undefined') toastr.error(`Не удалось обновить: ${result.error?.message || 'ошибка'}`, 'SLAY Images');
            }
        } finally {
            icon.className = origClass;
            refreshBtn.classList.remove('is-loading');
        }
    });
}

function bindSettingsEvents() {
    const settings = getSettings();

    const updateVisibility = () => {
        const apiType = settings.apiType;
        const isNaistera = apiType === 'naistera';
        const isGemini = apiType === 'gemini';
        const isOpenAI = apiType === 'openai';
        const isCustom = apiType === 'custom';

        document.getElementById('slay_settings_body')?.classList.toggle('iig-hidden', !settings.enabled);
        document.getElementById('slay_settings_body2')?.classList.toggle('iig-hidden', !settings.enabled);
        document.getElementById('slay_custom_format_row')?.classList.toggle('iig-hidden', !isCustom);
        document.getElementById('slay_custom_hint')?.classList.toggle('iig-hidden', !isCustom);

        const currentNaisModel = normalizeNaisteraModel(settings.naisteraModel);
        // Custom + images/generations body: no slot for reference images —
        // hide the refs UI so users don't configure refs that silently vanish.
        const isCustomImages = isCustom && (settings.customBodyFormat || 'chat') === 'images';
        const supportsRefs = (!isNaistera || currentNaisModel === 'grok' || currentNaisModel === 'nano banana') && !isCustomImages;

        document.getElementById('slay_model_row')?.classList.toggle('iig-hidden', isNaistera);
        // size (WxH) is used by openai dall-e style AND custom images/generations
        document.getElementById('slay_size_row')?.classList.toggle('iig-hidden', !(isOpenAI || isCustomImages));
        document.getElementById('slay_quality_row')?.classList.toggle('iig-hidden', !isOpenAI);
        document.getElementById('slay_naistera_model_row')?.classList.toggle('iig-hidden', !isNaistera);
        document.getElementById('slay_naistera_aspect_row')?.classList.toggle('iig-hidden', !isNaistera);
        // slay_naistera_preset_row removed — replaced by slay_style_row (always visible)
        document.getElementById('slay_naistera_hint')?.classList.toggle('iig-hidden', !isNaistera);
        // aspect_ratio + image_size live in "gemini params" but generateImageOpenAI
        // injects them into the prompt too ([aspect_ratio: X] [image_size: Y]) —
        // show for gemini, openai, and custom chat-format alike.
        document.getElementById('slay_gemini_params')?.classList.toggle('iig-hidden', !(isGemini || isOpenAI || (isCustom && !isCustomImages)));

        document.getElementById('slay_refs_section')?.classList.toggle('iig-hidden', !supportsRefs);
        document.getElementById('slay_image_context_section')?.classList.toggle('iig-hidden', !supportsRefs);
        document.getElementById('slay_image_context_count_row')?.classList.toggle('iig-hidden', !settings.imageContextEnabled || !supportsRefs);

        let noRefsHint = document.getElementById('slay_no_refs_hint');
        if (!noRefsHint) {
            noRefsHint = document.createElement('div');
            noRefsHint.id = 'slay_no_refs_hint';
            noRefsHint.className = 'hint';
            noRefsHint.style.color = '#ff9800';
            noRefsHint.style.marginTop = '4px';
            noRefsHint.textContent = 'Модель не поддерживает референсы';
            const modelRow = document.getElementById('slay_naistera_model_row');
            if (modelRow) modelRow.insertAdjacentElement('afterend', noRefsHint);
        }
        if (noRefsHint) noRefsHint.classList.toggle('iig-hidden', supportsRefs || !isNaistera);

        const wardrobeHint = document.getElementById('slay_wardrobe_hint');
        if (wardrobeHint) {
            if (!supportsRefs && isNaistera) {
                wardrobeHint.textContent = 'Модель не поддерживает референсы. Будут отправляться только текстовые описания.';
                wardrobeHint.style.color = '#ff9800';
            } else {
                wardrobeHint.textContent = 'Загрузите аутфиты для бота и юзера. Изображение активного аутфита отправится как референс, а словесное описание будет добавлено в промпт.';
                wardrobeHint.style.color = '';
            }
        }
        // Avatar ref sections removed
        document.getElementById('slay_naistera_video_section')?.classList.toggle('iig-hidden', !isNaistera);
        document.getElementById('slay_naistera_video_frequency_row')?.classList.toggle('iig-hidden', !(isNaistera && settings.naisteraVideoTest));
        const endpointInput = document.getElementById('slay_endpoint');
        if (endpointInput) endpointInput.placeholder = getEndpointPlaceholder(apiType);
    };

    document.getElementById('slay_sw_find_orphans')?.addEventListener('click', () => { window.slayWardrobe?.findOrphanImages?.(); });
    document.getElementById('slay_skip_crop')?.addEventListener('change', (e) => { settings.skipCrop = e.target.checked; saveSettings(); });
    document.getElementById('slay_sw_enabled')?.addEventListener('change', (e) => {
        const swS = SillyTavern.getContext().extensionSettings.slay_wardrobe;
        if (swS) swS.wardrobeEnabled = e.target.checked;
        SillyTavern.getContext().saveSettingsDebounced();
        document.getElementById('slay_wardrobe_body')?.classList.toggle('iig-hidden', !e.target.checked);
        // Apply immediately: drop or restore the outfit injection and the bar button.
        try { window.slayWardrobe?.refresh?.(); } catch (err) { iigLog('WARN', 'wardrobe refresh failed:', err.message); }
    });
    document.getElementById('slay_enabled')?.addEventListener('change', (e) => {
        settings.enabled = e.target.checked; saveSettings(); updateVisibility(); updateHeaderStatusDot();
        if (settings.enabled) { addButtonsToExistingMessages(); attachRegenButtonsInRoot(document.getElementById('chat') || document.body); }
        else iigStripOurUi();
    });
    document.getElementById('slay_external_blocks')?.addEventListener('change', (e) => { settings.externalBlocks = e.target.checked; saveSettings(); });

    // ── Connection profiles ──
    // Saved {name, apiType, endpoint, apiKey, model} snapshots. Applying one
    // copies its fields into live settings + syncs the visible inputs.
    const getConnProfiles = () => {
        if (!Array.isArray(settings.connectionProfiles)) settings.connectionProfiles = [];
        return settings.connectionProfiles;
    };
    const renderConnProfiles = (selectedName = '') => {
        const sel = document.getElementById('slay_conn_profile');
        if (!sel) return;
        const profiles = getConnProfiles();
        sel.innerHTML = '<option value="">— профили подключений —</option>';
        for (const p of profiles) {
            const o = document.createElement('option');
            o.value = p.name;
            o.textContent = p.name;
            if (p.name === selectedName) o.selected = true;
            sel.appendChild(o);
        }
    };
    renderConnProfiles();
    document.getElementById('slay_conn_profile')?.addEventListener('change', (e) => {
        const name = e.target.value;
        if (!name) return;
        const p = getConnProfiles().find(x => x.name === name);
        if (!p) return;
        settings.apiType = p.apiType || 'openai';
        settings.endpoint = p.endpoint || '';
        settings.apiKey = p.apiKey || '';
        settings.model = p.model || '';
        settings.customBodyFormat = p.customBodyFormat || 'chat';
        saveSettings();
        // Sync visible inputs to the applied profile
        const typeSel = document.getElementById('slay_api_type');
        if (typeSel) typeSel.value = settings.apiType;
        const epInput = document.getElementById('slay_endpoint');
        if (epInput) epInput.value = settings.endpoint;
        const keyInput = document.getElementById('slay_api_key');
        if (keyInput) keyInput.value = settings.apiKey;
        const modelInput = document.getElementById('slay_model');
        if (modelInput) modelInput.value = settings.model;
        const fmtSel = document.getElementById('slay_custom_body_format');
        if (fmtSel) fmtSel.value = settings.customBodyFormat;
        updateVisibility();
        toastr.success(`Профиль «${name}» применён`, 'SLAY Images', { timeOut: 2000 });
    });
    document.getElementById('slay_conn_profile_save')?.addEventListener('click', async () => {
        const defaultName = settings.model || settings.endpoint?.replace(/^https?:\/\//, '').split('/')[0] || 'профиль';
        const raw = await slayPromptInput('Имя профиля подключения:', defaultName);
        const name = (raw || '').trim();
        if (!name) return;
        const profiles = getConnProfiles();
        const snapshot = {
            name,
            apiType: settings.apiType,
            endpoint: settings.endpoint,
            apiKey: settings.apiKey,
            model: settings.model,
            customBodyFormat: settings.customBodyFormat || 'chat',
        };
        const existing = profiles.findIndex(x => x.name === name);
        if (existing >= 0) profiles[existing] = snapshot;
        else profiles.push(snapshot);
        saveSettings();
        renderConnProfiles(name);
        toastr.success(`Профиль «${name}» сохранён`, 'SLAY Images', { timeOut: 2000 });
    });
    document.getElementById('slay_conn_profile_delete')?.addEventListener('click', async () => {
        const sel = document.getElementById('slay_conn_profile');
        const name = sel?.value;
        if (!name) { toastr.info('Выберите профиль для удаления', 'SLAY Images', { timeOut: 2000 }); return; }
        if (!(await slayConfirm(`Удалить профиль «${name}»?`))) return;
        settings.connectionProfiles = getConnProfiles().filter(x => x.name !== name);
        saveSettings();
        renderConnProfiles();
        toastr.info(`Профиль «${name}» удалён`, 'SLAY Images', { timeOut: 2000 });
    });

    document.getElementById('slay_api_type')?.addEventListener('change', (e) => {
        const next = e.target.value;
        const endpointInput = document.getElementById('slay_endpoint');
        if (shouldReplaceEndpointForApiType(next, settings.endpoint)) { settings.endpoint = normalizeConfiguredEndpoint(next, ''); if (endpointInput) endpointInput.value = settings.endpoint; }
        else if (next === 'naistera') { settings.endpoint = normalizeConfiguredEndpoint(next, settings.endpoint); if (endpointInput) endpointInput.value = settings.endpoint; }
        // Warn, don't clear: reusing one proxy across api types is legitimate, but
        // pasting a new provider's key while the old provider's host is still in the
        // field silently ships that key to the wrong place.
        if (settings.endpoint && !shouldReplaceEndpointForApiType(next, settings.endpoint) && next !== 'naistera') {
            try {
                const host = new URL(settings.endpoint, location.origin).host;
                toastr.info(`Endpoint остался прежним: ${host}. Если это адрес другого провайдера — поменяйте его перед вводом нового ключа.`, 'SLAY Images', { timeOut: 9000 });
            } catch (e) { /* unparseable endpoint — nothing useful to say */ }
        }
        settings.apiType = next; saveSettings(); updateVisibility();
        // custom / naistera have no model listing — hand the user the text field.
        iigSyncModelInputMode({ forceManual: next === 'custom' || next === 'naistera' });
        if (next !== 'custom' && next !== 'naistera' && !settings.manualModel && settings.endpoint && settings.apiKey) {
            populateModelDatalist({ silent: true }).catch(() => {});
        }
    });
    document.getElementById('slay_endpoint')?.addEventListener('input', (e) => { settings.endpoint = e.target.value; saveSettings(); });
    // sanitizeApiKey strips zero-width unicode + NBSP that ride in from
    // clipboard (esp. Telegram) and would otherwise crash fetch with
    // "String contains non ISO-8859-1 code point".
    document.getElementById('slay_api_key')?.addEventListener('input', (e) => { settings.apiKey = sanitizeApiKey(e.target.value); saveSettings(); });
    document.getElementById('slay_key_toggle')?.addEventListener('click', () => {
        const input = document.getElementById('slay_api_key'); const icon = document.querySelector('#slay_key_toggle i');
        if (input.type === 'password') { input.type = 'text'; icon.classList.replace('fa-eye', 'fa-eye-slash'); } else { input.type = 'password'; icon.classList.replace('fa-eye-slash', 'fa-eye'); }
    });
    // Just save the model name. Don't auto-flip apiType based on model name —
    // OpenAI-compat routers expose Gemini models too, and user's explicit
    // apiType choice should be respected.
    // Input event (not change) so typing freely is saved as user types.
    // This text field is the MANUAL half of the pair — the default view is the
    // <select> below it, and the checkbox swaps between them.
    document.getElementById('slay_model')?.addEventListener('input', (e) => {
        settings.model = e.target.value.trim();
        saveSettings();
    });
    document.getElementById('slay_model_select')?.addEventListener('change', (e) => {
        settings.model = e.target.value;
        const inp = document.getElementById('slay_model');
        if (inp) inp.value = e.target.value;   // keep both views in sync
        saveSettings();
    });
    document.getElementById('slay_manual_model')?.addEventListener('change', (e) => {
        settings.manualModel = e.target.checked;
        saveSettings();
        iigSyncModelInputMode();
        if (!e.target.checked) populateModelDatalist({ silent: true }).catch(() => {});
    });
    // Fill the model autocomplete datalist. silent=true suppresses toasts
    // (used for the auto-fill on settings open so it's quiet).
    // Fill the model <select>. This used to be an <input list> + <datalist>, and
    // datalist FILTERS its suggestions by whatever is typed in the field — so once
    // a model name was saved, exactly one suggestion matched and the list looked
    // empty. That is the recurring "нет выпадающего списка" complaint, and it is
    // not fixable with a datalist. A real <select> always opens in full, and on a
    // phone it gets the native picker instead of datalist's awkward behaviour.
    async function populateModelDatalist({ silent = false } = {}) {
        if (!document.getElementById('slay_model_select')) return 0;
        const models = await fetchModels();
        // Re-resolve AFTER the await: ST can re-render the extensions drawer
        // mid-fetch, and populating a detached node looks like an empty dropdown.
        const sel = document.getElementById('slay_model_select');
        if (!sel || !sel.isConnected) return 0;
        const current = getSettings().model || '';
        sel.innerHTML = '';
        // Keep the saved model selectable even when the endpoint doesn't list it —
        // plenty of proxies serve models they never advertise.
        const list = current && !models.includes(current) ? [current, ...models] : models;
        if (list.length === 0) {
            const o = document.createElement('option');
            o.value = ''; o.textContent = '— список пуст, включите ручной ввод —';
            sel.appendChild(o);
        }
        for (const m of list) {
            const o = document.createElement('option');
            o.value = m; o.textContent = m;
            if (m === current) o.selected = true;
            sel.appendChild(o);
        }
        if (!silent) toastr.success(`Моделей: ${models.length}`, 'SLAY Images');
        return models.length;
    }

    // Nobody may end up locked out of typing: providers that cannot list models
    // (custom, naistera) or a failed fetch force manual entry on.
    function iigSyncModelInputMode({ forceManual = false } = {}) {
        const st = getSettings();
        if (forceManual && !st.manualModel) { st.manualModel = true; saveSettings(); }
        const manual = !!st.manualModel;
        const cb = document.getElementById('slay_manual_model');
        if (cb) cb.checked = manual;
        document.getElementById('slay_model')?.classList.toggle('iig-hidden', !manual);
        document.getElementById('slay_model_select')?.classList.toggle('iig-hidden', manual);
        document.getElementById('slay_refresh_models')?.classList.toggle('iig-hidden', manual);
    }
    document.getElementById('slay_refresh_models')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget; btn.classList.add('loading');
        try { await populateModelDatalist({ silent: false }); }
        catch (e) { toastr.error('Ошибка загрузки', 'SLAY Images'); } finally { btn.classList.remove('loading'); }
    });
    // Auto-fill the dropdown on settings open so the user doesn't have to press
    // 🔄 to see models (the recurring "нет выпадающего списка" complaint).
    // Guarded: only openai/gemini with creds present — skips custom (manual model)
    // and naistera (no model list), and avoids fetchModels' "set endpoint" toast.
    {
        const _s = getSettings();
        const canList = (_s.apiType === 'openai' || _s.apiType === 'gemini') && _s.endpoint && _s.apiKey;
        // custom / naistera never return a list, so those users must type.
        iigSyncModelInputMode({ forceManual: _s.apiType === 'custom' || _s.apiType === 'naistera' });
        if (canList && !_s.manualModel) {
            populateModelDatalist({ silent: true })
                .then(n => { if (!n) iigSyncModelInputMode({ forceManual: true }); })
                .catch(() => iigSyncModelInputMode({ forceManual: true }));
        }
    }
    document.getElementById('slay_custom_body_format')?.addEventListener('change', (e) => { settings.customBodyFormat = e.target.value; saveSettings(); updateVisibility(); });
    document.getElementById('slay_size')?.addEventListener('change', (e) => { settings.size = e.target.value; saveSettings(); });
    document.getElementById('slay_quality')?.addEventListener('change', (e) => { settings.quality = e.target.value; saveSettings(); });
    document.getElementById('slay_aspect_ratio')?.addEventListener('change', (e) => { settings.aspectRatio = e.target.value; saveSettings(); });
    document.getElementById('slay_image_size')?.addEventListener('change', (e) => { settings.imageSize = e.target.value; saveSettings(); });
    document.getElementById('slay_naistera_model')?.addEventListener('change', (e) => { settings.naisteraModel = normalizeNaisteraModel(e.target.value); saveSettings(); updateVisibility(); });
    document.getElementById('slay_naistera_aspect_ratio')?.addEventListener('change', (e) => { settings.naisteraAspectRatio = e.target.value; saveSettings(); });
    document.getElementById('slay_style_pick_btn')?.addEventListener('click', openStylePickerModal);
    document.getElementById('slay_image_context_enabled')?.addEventListener('change', (e) => { settings.imageContextEnabled = e.target.checked; saveSettings(); updateVisibility(); });
    document.getElementById('slay_image_context_count')?.addEventListener('input', (e) => { settings.imageContextCount = normalizeImageContextCount(e.target.value); e.target.value = String(settings.imageContextCount); saveSettings(); });
    document.getElementById('slay_send_char_ref')?.addEventListener('change', (e) => {
        settings.sendCharAvatar = e.target.checked;
        settings.naisteraSendCharAvatar = e.target.checked;
        saveSettings();
    });
    document.getElementById('slay_send_user_ref')?.addEventListener('change', (e) => {
        settings.sendUserAvatar = e.target.checked;
        settings.naisteraSendUserAvatar = e.target.checked;
        saveSettings();
    });
    // Avatar ref handlers removed — char/user refs + wardrobe cover this
    document.getElementById('slay_naistera_video_test')?.addEventListener('change', (e) => { settings.naisteraVideoTest = e.target.checked; saveSettings(); updateVisibility(); });
    document.getElementById('slay_naistera_video_every_n')?.addEventListener('input', (e) => { settings.naisteraVideoEveryN = normalizeNaisteraVideoFrequency(e.target.value); e.target.value = String(settings.naisteraVideoEveryN); saveSettings(); });
    document.getElementById('slay_max_retries')?.addEventListener('input', (e) => { const v = parseInt(e.target.value, 10); settings.maxRetries = Number.isNaN(v) ? 0 : Math.max(0, Math.min(5, v)); saveSettings(); });
    document.getElementById('slay_retry_delay')?.addEventListener('input', (e) => { const v = parseInt(e.target.value, 10); settings.retryDelay = Number.isNaN(v) ? 1000 : Math.max(500, v); saveSettings(); });
    document.getElementById('slay_export_logs')?.addEventListener('click', exportLogs);

    // Manual save removed

    // Test connection
    document.getElementById('slay_test_connection')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget; if (btn.classList.contains('testing')) return;
        btn.classList.add('testing'); const icon = btn.querySelector('i'); const orig = icon.className; icon.className = 'fa-solid fa-spinner';
        // Re-read settings fresh in case user just changed them
        const currentSettings = getSettings();
        iigLog('INFO', `Test connection: apiType=${currentSettings.apiType}, endpoint=${currentSettings.endpoint}, apiKey=${currentSettings.apiKey ? 'set' : 'empty'}`);
        try {
            if (!currentSettings.endpoint && currentSettings.apiType !== 'naistera') throw new Error('Укажите endpoint');
            if (!currentSettings.apiKey) throw new Error('Укажите API key');
            if (currentSettings.apiType === 'naistera') {
                const testUrl = (currentSettings.endpoint || 'https://naistera.org').replace(/\/$/, '');
                const r = await fetch(testUrl, { method: 'HEAD' }).catch(() => null);
                if (r?.ok) toastr.success('Connection OK', 'SLAY Images');
                else toastr.warning('Endpoint ответил не-OK', 'SLAY Images');
            } else if (currentSettings.apiType === 'custom') {
                // Custom = full URL to a generation endpoint; there is no
                // /v1/models to probe and a real POST would cost the user a
                // generation. HEAD tells us at least that the host answers.
                const testUrl = String(currentSettings.endpoint).trim().replace(/\/+$/, '');
                const r = await fetch(testUrl, { method: 'HEAD' }).catch(() => null);
                if (r) toastr.success(`Endpoint отвечает (HTTP ${r.status}). Полная проверка — только реальной генерацией.`, 'SLAY Images', { timeOut: 4000 });
                else toastr.warning('Endpoint недоступен (сеть/CORS). Проверь URL.', 'SLAY Images');
            } else {
                const models = await fetchModels();
                if (models.length > 0) toastr.success(`Connection OK — ${models.length} моделей`, 'SLAY Images');
                else toastr.warning('Подключение есть, но моделей для генерации картинок не найдено', 'SLAY Images');
            }
            btn.classList.add('test-success'); setTimeout(() => btn.classList.remove('test-success'), 700);
        } catch (error) {
            iigLog('ERROR', 'Test connection failed:', error.message);
            toastr.error(`Ошибка: ${error.message}`, 'SLAY Images');
            btn.classList.add('test-fail'); setTimeout(() => btn.classList.remove('test-fail'), 700);
        } finally { btn.classList.remove('testing'); icon.className = orig; }
    });

    // Wardrobe handlers
    document.getElementById('slay_sw_open_wardrobe')?.addEventListener('click', () => {
        if (window.slayWardrobe?.isReady()) window.slayWardrobe.openModal();
        else toastr.error('Гардероб не загружен', 'Гардероб');
    });
    document.getElementById('slay_sw_auto_describe')?.addEventListener('change', (e) => {
        const s = SillyTavern.getContext().extensionSettings.slay_wardrobe;
        if (s) { s.autoDescribe = e.target.checked; SillyTavern.getContext().saveSettingsDebounced(); }
        document.getElementById('slay_sw_describe_api_section')?.classList.toggle('iig-hidden', !e.target.checked);
        document.getElementById('slay_sw_describe_prompt_section')?.classList.toggle('iig-hidden', !e.target.checked);
    });
    document.getElementById('slay_sw_describe_prompt_style')?.addEventListener('change', (e) => {
        const s = SillyTavern.getContext().extensionSettings.slay_wardrobe;
        if (s) { s.describePromptStyle = e.target.value; SillyTavern.getContext().saveSettingsDebounced(); }
    });
    document.getElementById('slay_sw_describe_mode')?.addEventListener('change', (e) => {
        const s = SillyTavern.getContext().extensionSettings.slay_wardrobe;
        if (s) { s.describeMode = e.target.value; SillyTavern.getContext().saveSettingsDebounced(); }
        document.getElementById('slay_sw_direct_api_section')?.classList.toggle('iig-hidden', e.target.value !== 'direct');
    });
    document.getElementById('slay_sw_describe_api_format')?.addEventListener('change', (e) => {
        const s = SillyTavern.getContext().extensionSettings.slay_wardrobe;
        if (s) { s.describeApiFormat = e.target.value; SillyTavern.getContext().saveSettingsDebounced(); }
    });
    document.getElementById('slay_sw_describe_endpoint')?.addEventListener('input', (e) => {
        const s = SillyTavern.getContext().extensionSettings.slay_wardrobe;
        if (s) { s.describeEndpoint = e.target.value.trim(); SillyTavern.getContext().saveSettingsDebounced(); }
    });
    document.getElementById('slay_sw_describe_key')?.addEventListener('input', (e) => {
        const s = SillyTavern.getContext().extensionSettings.slay_wardrobe;
        if (s) { s.describeKey = sanitizeApiKey(e.target.value); SillyTavern.getContext().saveSettingsDebounced(); }
    });
    document.getElementById('slay_sw_describe_key_toggle')?.addEventListener('click', () => {
        const input = document.getElementById('slay_sw_describe_key'); const icon = document.querySelector('#slay_sw_describe_key_toggle i');
        if (input.type === 'password') { input.type = 'text'; icon.classList.replace('fa-eye', 'fa-eye-slash'); } else { input.type = 'password'; icon.classList.replace('fa-eye-slash', 'fa-eye'); }
    });
    document.getElementById('slay_sw_describe_model')?.addEventListener('input', (e) => {
        const s = SillyTavern.getContext().extensionSettings.slay_wardrobe;
        if (s) { s.describeModel = e.target.value.trim(); SillyTavern.getContext().saveSettingsDebounced(); }
    });
    document.getElementById('slay_sw_describe_model_select')?.addEventListener('change', (e) => {
        const s = SillyTavern.getContext().extensionSettings.slay_wardrobe;
        if (s) { s.describeModel = e.target.value; SillyTavern.getContext().saveSettingsDebounced(); }
        const inp = document.getElementById('slay_sw_describe_model');
        if (inp) inp.value = e.target.value;
    });
    document.getElementById('slay_sw_describe_manual')?.addEventListener('change', (e) => {
        const s = SillyTavern.getContext().extensionSettings.slay_wardrobe;
        if (s) { s.describeManualModel = e.target.checked; SillyTavern.getContext().saveSettingsDebounced(); }
        document.getElementById('slay_sw_describe_model')?.classList.toggle('iig-hidden', !e.target.checked);
        document.getElementById('slay_sw_describe_model_select')?.classList.toggle('iig-hidden', e.target.checked);
        document.getElementById('slay_sw_describe_refresh')?.classList.toggle('iig-hidden', e.target.checked);
    });
    document.getElementById('slay_sw_describe_refresh')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget; btn.classList.add('loading');
        try {
            const swS = SillyTavern.getContext().extensionSettings.slay_wardrobe || {};
            const iigS = SillyTavern.getContext().extensionSettings[MODULE_NAME] || {};
            // Host and key resolve as a pair — never send the main key to a
            // custom describe endpoint (see swAnalyzeOutfit for the full note).
            const ep = normalizeApiEndpoint(swS.describeEndpoint || iigS.endpoint || '');
            const key = swS.describeEndpoint ? (swS.describeKey || '') : (iigS.apiKey || '');
            if (swS.describeEndpoint && !key) { toastr.error('Укажите ключ к своему Endpoint для описаний — основной ключ туда не отправляется.', 'Гардероб', { timeOut: 8000 }); return; }
            if (!ep || !key) throw new Error('Укажите endpoint и API key');
            const url = `${ep}/v1/models`;
            const resp = await fetch(url, { method: 'GET', headers: buildAuthHeaders(key) });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const models = (data.data || []).map(m => m.id).sort();
            // Same story as the main model field: a <select>, not a datalist.
            const sel = document.getElementById('slay_sw_describe_model_select');
            if (sel) {
                const cur = swS.describeModel || 'gemini-2.5-flash';
                const list = cur && !models.includes(cur) ? [cur, ...models] : models;
                sel.innerHTML = '';
                for (const m of list) {
                    const o = document.createElement('option');
                    o.value = m; o.textContent = m;
                    if (m === cur) o.selected = true;
                    sel.appendChild(o);
                }
            }
            if (models.length === 0) {
                // Nothing to choose from — don't strand the user on an empty list.
                swS.describeManualModel = true;
                SillyTavern.getContext().saveSettingsDebounced();
                document.getElementById('slay_sw_describe_manual')?.setAttribute('checked', 'checked');
                document.getElementById('slay_sw_describe_model')?.classList.remove('iig-hidden');
                document.getElementById('slay_sw_describe_model_select')?.classList.add('iig-hidden');
            }
            toastr.success(`Найдено моделей: ${models.length}`, 'Гардероб');
        } catch (error) { toastr.error(`Ошибка: ${error.message}`, 'Гардероб'); }
        finally { btn.classList.remove('loading'); }
    });
    document.getElementById('slay_sw_describe_test')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget; if (btn.classList.contains('testing')) return;
        btn.classList.add('testing'); const icon = btn.querySelector('i'); const orig = icon.className; icon.className = 'fa-solid fa-spinner iig-spin-anim';
        try {
            const swS = SillyTavern.getContext().extensionSettings.slay_wardrobe || {};
            const iigS = SillyTavern.getContext().extensionSettings[MODULE_NAME] || {};
            // Host and key resolve as a pair — never send the main key to a
            // custom describe endpoint (see swAnalyzeOutfit for the full note).
            const ep = normalizeApiEndpoint(swS.describeEndpoint || iigS.endpoint || '');
            const key = swS.describeEndpoint ? (swS.describeKey || '') : (iigS.apiKey || '');
            if (swS.describeEndpoint && !key) { toastr.error('Укажите ключ к своему Endpoint для описаний — основной ключ туда не отправляется.', 'Гардероб', { timeOut: 8000 }); return; }
            if (!ep || !key) throw new Error('Укажите endpoint и API key');
            const url = `${ep}/v1/models`;
            const resp = await fetch(url, { method: 'GET', headers: buildAuthHeaders(key) });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const count = (data.data || []).length;
            toastr.success(`Connection OK — ${count} моделей доступно`, 'Гардероб');
            btn.classList.add('test-success'); setTimeout(() => btn.classList.remove('test-success'), 700);
        } catch (error) {
            toastr.error(`Ошибка: ${error.message}`, 'Гардероб');
            btn.classList.add('test-fail'); setTimeout(() => btn.classList.remove('test-fail'), 700);
        } finally { btn.classList.remove('testing'); icon.className = orig; }
    });
    document.getElementById('slay_sw_send_outfit_desc')?.addEventListener('change', (e) => {
        const s = SillyTavern.getContext().extensionSettings.slay_wardrobe;
        if (s) { s.sendOutfitDescription = e.target.checked; SillyTavern.getContext().saveSettingsDebounced(); }
    });
    document.getElementById('slay_sw_send_outfit_image_bot')?.addEventListener('change', (e) => {
        const s = SillyTavern.getContext().extensionSettings.slay_wardrobe;
        if (s) { s.sendOutfitImageBot = e.target.checked; SillyTavern.getContext().saveSettingsDebounced(); }
    });
    document.getElementById('slay_sw_send_outfit_image_user')?.addEventListener('change', (e) => {
        const s = SillyTavern.getContext().extensionSettings.slay_wardrobe;
        if (s) { s.sendOutfitImageUser = e.target.checked; SillyTavern.getContext().saveSettingsDebounced(); }
    });
    document.getElementById('slay_sw_collage')?.addEventListener('change', (e) => {
        const s = SillyTavern.getContext().extensionSettings.slay_wardrobe;
        if (s) { s.experimentalCollage = e.target.checked; SillyTavern.getContext().saveSettingsDebounced(); }
    });
    document.getElementById('slay_sw_skip_desc_warn')?.addEventListener('change', (e) => {
        const s = SillyTavern.getContext().extensionSettings.slay_wardrobe;
        if (s) { s.skipDescriptionWarning = e.target.checked; SillyTavern.getContext().saveSettingsDebounced(); }
    });
    document.getElementById('slay_sw_show_float')?.addEventListener('change', (e) => {
        const s = SillyTavern.getContext().extensionSettings.slay_wardrobe;
        if (s) { s.showFloatingBtn = e.target.checked; SillyTavern.getContext().saveSettingsDebounced(); }
        $('#sw-bar-btn').toggle(e.target.checked);
    });
    document.getElementById('slay_sw_max_dim')?.addEventListener('change', (e) => {
        const ctx = SillyTavern.getContext();
        if (ctx.extensionSettings.slay_wardrobe) { ctx.extensionSettings.slay_wardrobe.maxDimension = Math.max(128, Math.min(1024, parseInt(e.target.value) || 512)); ctx.saveSettingsDebounced(); }
    });
    document.getElementById('slay_sw_modal_width')?.addEventListener('change', (e) => {
        const ctx = SillyTavern.getContext();
        const valid = ['compact', 'normal', 'wide', 'xwide', 'full'];
        const val = valid.includes(e.target.value) ? e.target.value : 'normal';
        if (ctx.extensionSettings.slay_wardrobe) {
            ctx.extensionSettings.slay_wardrobe.modalWidth = val;
            ctx.saveSettingsDebounced();
        }
        // Apply immediately so juser sees the change if wardrobe is open
        window.slayWardrobe?.applyModalWidth?.();
    });

    updateVisibility();
}

// ── Lightbox ──
function initLightbox() {
    if (document.getElementById('slay_lightbox')) return;
    const overlay = document.createElement('div'); overlay.id = 'slay_lightbox'; overlay.className = 'iig-lightbox';
    overlay.innerHTML = `<div class="iig-lightbox-backdrop"></div><button class="iig-lightbox-close" title="Закрыть"><i class="fa-solid fa-xmark"></i></button><div class="iig-lightbox-content"><img class="iig-lightbox-img" src="" alt=""><div class="iig-lightbox-caption"></div></div>`;
    document.body.appendChild(overlay);
    const close = (e) => {
        // CRITICAL: stop the event from bubbling to document. Otherwise ST's extensions
        // drawer outside-click detector sees a click that isn't inside the drawer and
        // closes the drawer in the background — invisibly, because the style picker
        // modal (which opened the lightbox) is still covering the screen. Once the
        // picker is dismissed later, the user finds themselves "kicked to chat".
        if (e) { e.preventDefault(); e.stopPropagation(); }
        overlay.classList.remove('open');
        document.body.style.overflow = '';
    };
    overlay.querySelector('.iig-lightbox-backdrop').addEventListener('click', close);
    overlay.querySelector('.iig-lightbox-close').addEventListener('click', close);

    // ── Pinch-zoom, drag and double-tap, touch only ──────────────────────────
    // SillyTavern's own viewport meta carries user-scalable=no, so the browser
    // will not zoom the page — and the lightbox clamps the image to 90vw. On a
    // 360px phone a 1024×1024 generation therefore renders about 324px wide and
    // a face is roughly 40 pixels: the extension exists to make pictures and you
    // could not actually look at them. Desktop is left alone (big window, working
    // browser zoom, and a wheel handler would fight page scrolling).
    const imgEl = overlay.querySelector('.iig-lightbox-img');
    let sc = 1, tx = 0, ty = 0, startSc = 1, startDist = 0, sx = 0, sy = 0, panning = false, moved = false, lastTap = 0;
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const apply = () => { imgEl.style.transform = `translate(${tx}px,${ty}px) scale(${sc})`; };
    const resetZoom = () => { sc = 1; tx = 0; ty = 0; imgEl.style.transition = 'transform .2s'; apply(); setTimeout(() => { imgEl.style.transition = ''; }, 220); };
    // Reset whenever a new picture is shown, so you never open one already zoomed.
    overlay.addEventListener('slay-lightbox-open', resetZoom);
    imgEl.style.transformOrigin = 'center center';
    imgEl.style.touchAction = 'none';

    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    imgEl.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) { startDist = dist(e.touches); startSc = sc; panning = false; moved = true; }
        else if (e.touches.length === 1) {
            panning = sc > 1;                       // only drag once zoomed in
            sx = e.touches[0].clientX - tx; sy = e.touches[0].clientY - ty;
            moved = false;
        }
    }, { passive: true });

    imgEl.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2 && startDist > 0) {
            e.preventDefault();
            sc = clamp(startSc * (dist(e.touches) / startDist), 1, 6);
            if (sc === 1) { tx = 0; ty = 0; }
            apply(); moved = true;
        } else if (panning && e.touches.length === 1) {
            e.preventDefault();
            tx = e.touches[0].clientX - sx; ty = e.touches[0].clientY - sy;
            apply(); moved = true;
        }
    }, { passive: false });

    imgEl.addEventListener('touchend', (e) => {
        if (e.touches.length === 0) {
            startDist = 0; panning = false;
            const now = Date.now();
            if (!moved) {
                if (now - lastTap < 300) {          // double tap: toggle 1× / 2.5×
                    if (sc > 1) resetZoom(); else { sc = 2.5; apply(); }
                    lastTap = 0;
                    return;
                }
                lastTap = now;
                // Single tap closes, but only at 1× — otherwise every attempt to
                // reposition a zoomed picture would dismiss it.
                if (sc === 1) setTimeout(() => { if (Date.now() - lastTap >= 290 && sc === 1) close(e); }, 300);
            }
        }
    }, { passive: true });

    // Mouse click still closes (desktop behaviour unchanged).
    imgEl.addEventListener('click', (e) => { if (e.detail > 0 && sc === 1) close(e); });
    // Eat all touch/pointer phases at the overlay boundary so nothing bubbles to the
    // drawer's outside-click listeners while the lightbox is up.
    const stop = e => e.stopPropagation();
    overlay.addEventListener('touchstart', stop, { passive: true });
    overlay.addEventListener('touchend', stop, { passive: true });
    overlay.addEventListener('pointerdown', stop);
    overlay.addEventListener('pointerup', stop);
    overlay.addEventListener('mousedown', stop);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay.classList.contains('open')) close(); });
    // Lightbox click — bound on DOCUMENT with capture:true, not on #chat.
    // Failure modes the old #chat-bubble listener died to:
    //   1. ST re-creating #chat orphans listeners on the old element.
    //   2. Third-party stopPropagation in bubble eats the event.
    //   3. The visible <img> not being in the event path at all (covered by
    //      an overlay, or pointer-events tricks) — solved by elementsFromPoint
    //      fallback below: we look for an img directly under the click point.
    // Eligibility is now src-based (/user/images/) OR marker-based — presets
    // and regex scripts can strip our class/attribute from the tag, but the
    // generated file path always survives (it IS what's being displayed).
    const isOurImage = (img) => {
        if (!img || img.tagName !== 'IMG') return false;
        if (img.classList.contains('iig-error-image') || img.closest('.iig-error-placeholder')) return false;
        const src = img.getAttribute('src') || '';
        if (!src || src.includes('[IMG:GEN]') || src.includes('error.svg') || src.includes('[IMG:ERROR')) return false;
        return src.includes('/user/images/')
            || img.classList.contains('iig-generated-image')
            || img.hasAttribute('data-iig-instruction');
    };
    document.addEventListener('click', (e) => {
        if (e.target.closest?.('.iig-regen-btn')) return;
        // Interactive elements keep their clicks — capture-phase preventDefault
        // here would hijack buttons/links/inputs that sit over a chat image
        // (message action buttons, bot-template controls, edit textarea).
        if (e.target.closest?.('button, input, textarea, select, a, [role="button"], [role="link"], [contenteditable="true"], .menu_button, .mes_button')) return;
        if (overlay.classList.contains('open')) return; // lightbox itself is up
        // 1) Normal path: img is in the event path
        let img = e.target.tagName === 'IMG' ? e.target : e.target.closest?.('img');
        // 2) Fallback: click landed on something covering the img — probe
        //    everything under the pointer coordinates. GATED to clicks whose
        //    actual target is inside #chat: without the gate, a click on the
        //    settings drawer / any panel rendered ABOVE the chat would x-ray
        //    through the UI to a chat image underneath and open the lightbox
        //    (reported: clicking "save profile" opened the image behind the
        //    drawer). Overlays that legitimately cover a chat image (regen
        //    overlay, bot-template divs) all live inside #chat, so the gate
        //    keeps the fallback working for them.
        if ((!img || !isOurImage(img))
            && e.target.closest?.('#chat')
            && typeof document.elementsFromPoint === 'function') {
            const under = document.elementsFromPoint(e.clientX, e.clientY);
            img = under.find(el => el.tagName === 'IMG' && isOurImage(el)) || img;
        }
        if (!img || !isOurImage(img)) return;
        if (!img.closest('#chat')) return; // only chat images
        console.log('[IIG-LB] OPEN', (img.getAttribute('src') || '').slice(-60));
        e.preventDefault(); e.stopPropagation();
        overlay.querySelector('.iig-lightbox-img').src = img.src;
        overlay.querySelector('.iig-lightbox-caption').textContent = img.alt || '';
        overlay.classList.add('open');
        overlay.dispatchEvent(new Event('slay-lightbox-open'));   // reset any leftover zoom
        document.body.style.overflow = 'hidden'; // Prevent background scroll on iOS
    }, { capture: true });
}

function updateHeaderStatusDot() {
    const settings = getSettings();
    const header = document.querySelector('.inline-drawer-header');
    if (!header) return;
    let dot = header.querySelector('.iig-header-dot');
    if (!dot) { dot = document.createElement('span'); dot.className = 'iig-header-dot'; const chevron = header.querySelector('.inline-drawer-icon'); if (chevron) header.insertBefore(dot, chevron); else header.appendChild(dot); }
    dot.classList.toggle('active', settings.enabled);
}

// ── Initialization ──
(function init() {
    const context = SillyTavern.getContext();
    iigLog('INFO', `Initializing Slay Images v${SLAY_VERSION}`);

    if (context.extensionSettings.slay_image_gen) {
        const s = context.extensionSettings.slay_image_gen;
        if (typeof s.sendCharAvatar !== 'boolean') s.sendCharAvatar = true;
        if (typeof s.sendUserAvatar !== 'boolean') s.sendUserAvatar = true;
        // One-time v4.1 migration: earlier code (4.0.x) force-disabled these on every startup,
        // leaving a sticky `false` in many users' settings. Reset once, then remember so we don't
        // keep overwriting intentional user choices on every future startup.
        if (!s.refMigratedV41) {
            s.sendCharAvatar = true;
            s.sendUserAvatar = true;
            s.refMigratedV41 = true;
            iigLog('INFO', 'refMigratedV41: reset sendCharAvatar/sendUserAvatar to true (one-time)');
        }
        // Drop dead flags from PR that we no longer use
        if ('sendCharRefOnlyIfMentioned' in s) delete s.sendCharRefOnlyIfMentioned;
        if ('sendUserRefOnlyIfMentioned' in s) delete s.sendUserRefOnlyIfMentioned;
        s.naisteraSendCharAvatar = s.sendCharAvatar;
        s.naisteraSendUserAvatar = s.sendUserAvatar;
    }

    getSettings();

    context.eventSource.on(context.event_types.APP_READY, () => {
        restoreRefsFromLocalStorage();
        createSettingsUI();
        addButtonsToExistingMessages();
        initLightbox();
        updateHeaderStatusDot();
        initMobileSaveListeners();
        // Attach regen buttons to pre-existing generated images in chat
        setTimeout(() => attachRegenButtonsInRoot(document.getElementById('chat') || document.body, { rehydratePending: true }), 400);
        // MutationObserver — catches re-renders that skip CHARACTER_MESSAGE_RENDERED
        // (swipes, edits, MESSAGE_UPDATED, etc.)
        const chatEl = document.getElementById('chat');
        if (chatEl && !chatEl.dataset.iigRegenObserverBound) {
            const obs = new MutationObserver((mutations) => {
                for (const m of mutations) {
                    for (const node of m.addedNodes) {
                        if (node.nodeType === 1) attachRegenButtonsInRoot(node);
                    }
                }
            });
            obs.observe(chatEl, { childList: true, subtree: true });
            chatEl.dataset.iigRegenObserverBound = '1';
        }
        iigLog('INFO', 'Slay Images extension loaded');
    });

    context.eventSource.on(context.event_types.CHAT_CHANGED, () => {
        // Before the timeout, not inside it: a generation can start during those
        // 300 ms and would read the previous chat's entry on the way past.
        clearAllContextRefCache();
        setTimeout(() => {
            restoreRefsFromLocalStorage();
            addButtonsToExistingMessages();
            renderRefSlots();
            attachRegenButtonsInRoot(document.getElementById('chat') || document.body, { rehydratePending: true });
        }, 300);
    });

    // Persona switch (and many other settings changes) emits SETTINGS_UPDATED.
    // Use it to refresh ref-slot labels — the {{user}} title needs to follow
    // whichever persona is currently active. Debounced so a burst of settings
    // saves rerenders only once.
    if (context.event_types.SETTINGS_UPDATED) {
        context.eventSource.on(context.event_types.SETTINGS_UPDATED, () => {
            renderRefSlotsDebounced();
        });
    }

    context.eventSource.makeLast(context.event_types.CHARACTER_MESSAGE_RENDERED, async (messageId) => {
        await onMessageReceived(messageId);
        const mesEl = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
        if (mesEl) attachRegenButtonsInRoot(mesEl);
    });

    // Explicit re-bind on message edit. ST replaces .mes_text innerHTML when
    // the user saves an edit; the new <img> needs a fresh regen button. We
    // used to rely solely on MutationObserver but it occasionally missed the
    // mutation depending on how ST patched the DOM, leaving the img buttonless.
    const REBIND_EDIT_EVENTS = [
        'MESSAGE_UPDATED', 'MESSAGE_EDITED', 'MESSAGE_RECEIVED', 'MESSAGE_SWIPED',
    ];
    for (const evName of REBIND_EDIT_EVENTS) {
        const evType = context.event_types?.[evName];
        if (!evType) continue;
        context.eventSource.on(evType, (messageId) => {
            setTimeout(() => {
                const mesEl = (Number.isInteger(messageId))
                    ? document.querySelector(`#chat .mes[mesid="${messageId}"]`)
                    : null;
                attachRegenButtonsInRoot(mesEl || document.getElementById('chat') || document.body);
            }, 50);
        });
    }

    iigLog('INFO', 'Slay Images initialized');
})();
