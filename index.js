/**
 * Slay Inline Image Generation + Wardrobe
 * Merged extension: notsosillynotsoimages (NPC refs) + sillyimages (wardrobe)
 * v4.0.0 by aceeenvw + 0xl0cal + Wewwa
 */

/* ╔═══════════════════════════════════════════════════════════════╗
   ║  MODULE 1: SlayWardrobe                                       ║
   ╚═══════════════════════════════════════════════════════════════╝ */

(function initWardrobe() {
    'use strict';
    const SW = 'slay_wardrobe';

    function uid() { return Date.now().toString(36) + Math.random().toString(36).substring(2, 8); }
    function swLog(l, ...a) { (l === 'ERROR' ? console.error : l === 'WARN' ? console.warn : console.log)('[SW]', ...a); }
    function esc(t) { const d = document.createElement('div'); d.textContent = t || ''; return d.innerHTML; }

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

    // ── Defaults (v4 — global items, per-character active outfits) ──
    const swDefaults = Object.freeze({
        items: [],
        activeOutfits: {},
        maxDimension: 512,
        showFloatingBtn: false,
        autoDescribe: true,
        describeMode: 'direct',
        describeModel: '',
        describeEndpoint: '',
        describeKey: '',
        describePromptStyle: 'detailed',
        sendOutfitDescription: true,
        sendOutfitImageBot: true,
        sendOutfitImageUser: true,
        experimentalCollage: false,
        skipDescriptionWarning: false,
    });

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
    function swRemoveItem(id) {
        const s = swGetSettings();
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
        swSave();
        return true;
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

    function swResize(file, maxDim) {
        return new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = (e) => { const img = new Image(); img.onload = () => { let { width: w, height: h } = img; if (w > maxDim || h > maxDim) { const s = Math.min(maxDim / w, maxDim / h); w = Math.round(w * s); h = Math.round(h * s); } const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h); res({ base64: c.toDataURL('image/png').split(',')[1] }); }; img.onerror = () => rej(new Error('decode')); img.src = e.target.result; };
            r.onerror = () => rej(new Error('read')); r.readAsDataURL(file);
        });
    }

    // ── Save wardrobe image to server file ──
    async function swSaveImageToFile(base64, label) {
        const ctx = SillyTavern.getContext();
        const safeName = label.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
        const filename = `wardrobe_${safeName}_${Date.now()}`;
        const response = await fetch('/api/images/upload', {
            method: 'POST', headers: ctx.getRequestHeaders(),
            body: JSON.stringify({ image: base64, format: 'png', ch_name: 'wardrobe_refs', filename })
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
        } catch(e) { swLog('WARN', `swLoadImageAsBase64 failed: ${path}`, e.message); return null; }
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
    let swOpen = false, swTab = 'bot', swCatTab = 'full', swTagFilter = null, swForWhoFilter = null;

    function swOpenModal() {
        swCloseModal();
        swInjectV4Styles();
        swOpen = true;
        const cn = swCharName();
        if (!cn) { toastr.warning('Выберите персонажа', 'Гардероб'); swOpen = false; return; }

        const ov = document.createElement('div'); ov.id = 'sw-modal-overlay';
        ov.addEventListener('click', (e) => { if (e.target === ov) swCloseModal(); });

        const co = swGetCharOutfit();
        const m = document.createElement('div'); m.id = 'sw-modal';
        m.innerHTML = `
            <div class="sw-modal-header">
                <span>\uD83D\uDC85 Гардероб — <b>${esc(cn)}</b></span>
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
    function swEsc(e) { if (e.key === 'Escape') swCloseModal(); }
    function swCloseModal() { swOpen = false; document.getElementById('sw-modal-overlay')?.remove(); document.removeEventListener('keydown', swEsc); }

    function swRender() {
        const content = document.getElementById('sw-tab-content');
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
        }

        // ── Tag filter ──
        if (tagWrap) {
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

        // ── For who filter ──
        const forWhoWrap = document.getElementById('sw-forwho-filter');
        if (forWhoWrap) {
            const fwLabels = { '': 'Все', 'bot': '🤖 Бот', 'user': '👤 Юзер' };
            let fwHtml = '';
            for (const [key, label] of Object.entries(fwLabels)) {
                const active = (swForWhoFilter || '') === key;
                fwHtml += `<div class="sw-tag-chip ${active ? 'sw-tag-chip-active' : ''}" data-fw="${key}">${label}</div>`;
            }
            forWhoWrap.innerHTML = fwHtml;
            for (const chip of forWhoWrap.querySelectorAll('.sw-tag-chip')) {
                chip.addEventListener('click', () => {
                    swForWhoFilter = chip.dataset.fw || null;
                    swRender();
                });
            }
        }

        // ── Filter items by category + tag + forWho ──
        const allItems = swGetSettings().items;
        const filtered = allItems.filter(o => {
            if (o.category !== swCatTab) return false;
            if (swTagFilter && (!Array.isArray(o.tags) || !o.tags.includes(swTagFilter))) return false;
            if (swForWhoFilter && o.forWho && o.forWho !== 'all' && o.forWho !== swForWhoFilter) return false;
            return true;
        });

        const equippedId = co[swTab]?.[swCatTab] || null;

        // ── Grid ──
        let h = '<div class="sw-outfit-grid"><div class="sw-outfit-card sw-upload-card" id="sw-upload-trigger"><div class="sw-upload-icon"><i class="fa-solid fa-plus"></i></div><span>Загрузить</span></div>';
        for (const o of filtered) {
            const a = o.id === equippedId;
            h += `<div class="sw-outfit-card ${a ? 'sw-outfit-active' : ''}" data-id="${o.id}">
                <div class="sw-outfit-img-wrap"><img src="${swGetOutfitSrc(o)}" alt="${esc(o.name)}" class="sw-outfit-img" loading="lazy">${a ? '<div class="sw-active-badge"><i class="fa-solid fa-check"></i></div>' : ''}</div>
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

        document.getElementById('sw-upload-trigger')?.addEventListener('click', swUpload);
        for (const card of content.querySelectorAll('.sw-outfit-card[data-id]')) {
            const id = card.dataset.id;
            card.querySelector('.sw-outfit-img')?.addEventListener('click', (e) => { e.preventDefault(); e.stopImmediatePropagation(); swToggle(id); });
            card.querySelector('.sw-btn-activate')?.addEventListener('click', (e) => { e.preventDefault(); e.stopImmediatePropagation(); swToggle(id); });
            card.querySelector('.sw-btn-edit')?.addEventListener('click', (e) => { e.preventDefault(); e.stopImmediatePropagation(); swEdit(id); });
            card.querySelector('.sw-btn-regen')?.addEventListener('click', (e) => { e.preventDefault(); e.stopImmediatePropagation(); swRegenDescription(id); });
            card.querySelector('.sw-btn-delete')?.addEventListener('click', (e) => { e.preventDefault(); e.stopImmediatePropagation(); if (confirm('Удалить?')) { swRemoveItem(id); swRender(); toastr.info('Удалён', 'Гардероб'); } });
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

    // Custom modal for outfit description choice
    function swShowDescriptionModal(outfitName) {
        return new Promise((resolve) => {
                        const ov = document.createElement('div');
            ov.className = 'sw-desc-overlay';
            const m = document.createElement('div');
            m.className = 'sw-desc-modal';
            m.innerHTML = `
                <div class="sw-desc-header">
                    <div class="sw-desc-title">\uD83D\uDC85 Описание отсутствует</div>
                    <div class="sw-desc-subtitle">\u00AB${esc(outfitName)}\u00BB — для наилучшего результата добавьте описание одежды</div>
                </div>
                <div class="sw-desc-body">
                    <button class="sw-desc-btn sw-desc-btn-secondary" data-choice="skip">
                        <b>Без описания</b><br><span>Надеть как есть — одежда может не подтянуться</span>
                    </button>
                    <button class="sw-desc-btn sw-desc-btn-primary" data-choice="manual">
                        <b>\u270F\uFE0F Ввести вручную</b><br><span>Описать аутфит своими словами</span>
                    </button>
                    <button class="sw-desc-btn sw-desc-btn-primary" data-choice="ai">
                        <b>\uD83E\uDD16 Сгенерировать ИИ</b><br><span>Отправить картинку на анализ через чат-API</span>
                    </button>
                </div>`;
            ov.appendChild(m);
            swGetModalContainer().appendChild(ov);

            for (const btn of m.querySelectorAll('.sw-desc-btn')) {
                btn.addEventListener('click', () => { ov.remove(); resolve(btn.dataset.choice); });
            }
            ov.addEventListener('click', (e) => { if (e.target === ov) { ov.remove(); resolve(null); } });
            document.addEventListener('keydown', function escHandler(e) {
                if (e.key === 'Escape') { ov.remove(); resolve(null); document.removeEventListener('keydown', escHandler); }
            });
        });
    }

    // ── Upload modal (custom, replaces browser prompts) ──
    function swGetModalContainer() { return document.getElementById('sw-modal-overlay') || document.body; }

    function swShowUploadModal(defaultName) {
        return new Promise((resolve) => {
            swInjectV4Styles();
                        const ov = document.createElement('div');
            ov.className = 'sw-upload-modal-overlay';
            const m = document.createElement('div');
            m.className = 'sw-upload-modal';
            let tagsHtml = '';
            for (const tag of TAG_KEYS) {
                tagsHtml += `<label class="sw-upload-tag"><input type="checkbox" value="${tag}"> ${esc(TAGS[tag])}</label>`;
            }
            let catOptions = '';
            for (const cat of CAT_KEYS) {
                catOptions += `<option value="${cat}">${esc(CATEGORIES[cat])}</option>`;
            }
            m.innerHTML = `
                <h3>\uD83D\uDC57 Новый предмет</h3>
                <label>Название</label>
                <input type="text" id="sw-upl-name" value="${esc(defaultName)}" placeholder="Название предмета">
                <label>Категория</label>
                <select id="sw-upl-cat">${catOptions}</select>
                <label>Для кого</label>
                <select id="sw-upl-forwho"><option value="all">Все</option><option value="bot">Бот</option><option value="user">Юзер</option></select>
                <label>Теги</label>
                <div class="sw-upload-tags" id="sw-upl-tags">${tagsHtml}</div>
                <div class="sw-upload-btns">
                    <button class="sw-upload-btn sw-upload-btn-cancel" id="sw-upl-cancel">Отмена</button>
                    <button class="sw-upload-btn sw-upload-btn-save" id="sw-upl-save">Сохранить</button>
                </div>`;
            ov.appendChild(m);
            swGetModalContainer().appendChild(ov);

            // Pre-select current category tab
            const catSel = m.querySelector('#sw-upl-cat');
            if (catSel) catSel.value = swCatTab;

            const close = (val) => { ov.remove(); resolve(val); };
            m.querySelector('#sw-upl-cancel').addEventListener('click', () => close(null));
            ov.addEventListener('click', (e) => { if (e.target === ov) close(null); });
            m.querySelector('#sw-upl-save').addEventListener('click', () => {
                const name = m.querySelector('#sw-upl-name').value.trim();
                if (!name) { toastr.warning('Введите название', 'Гардероб'); return; }
                const category = catSel.value;
                const forWho = m.querySelector('#sw-upl-forwho').value;
                const tags = [...m.querySelectorAll('#sw-upl-tags input:checked')].map(c => c.value);
                close({ name, category, forWho, tags });
            });
            document.addEventListener('keydown', function escHandler(e) {
                if (e.key === 'Escape') { close(null); document.removeEventListener('keydown', escHandler); }
            });
            // Focus name input
            setTimeout(() => m.querySelector('#sw-upl-name')?.focus(), 50);
        });
    }

    // ── Description input modal (replaces browser prompt()) ──
    function swShowDescInput(title, value) {
        return new Promise((resolve) => {
            swInjectV4Styles();
                        const ov = document.createElement('div');
            ov.className = 'sw-desc-input-overlay';
            ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:200001;display:flex;align-items:flex-start;justify-content:center;padding:20px;padding-top:10vh;overflow-y:auto;-webkit-overflow-scrolling:touch;';
            const m = document.createElement('div');
            m.style.cssText = 'background:rgba(30,30,40,0.98);border-radius:14px;padding:20px;width:420px;max-width:90vw;max-height:80vh;overflow-y:auto;color:#ddd;box-shadow:0 12px 48px rgba(0,0,0,0.5);border:1px solid rgba(244,114,182,0.15);flex-shrink:0;';
            m.innerHTML = `
                <div style="font-size:14px;font-weight:600;color:#f472b6;margin-bottom:12px;">${esc(title)}</div>
                <textarea id="sw-descinput-text" style="width:100%;min-height:100px;max-height:200px;padding:10px;border-radius:8px;border:1px solid rgba(244,114,182,0.2);background:rgba(0,0,0,0.3);color:#eee;font-size:13px;line-height:1.5;resize:vertical;box-sizing:border-box;font-family:inherit;">${esc(value || '')}</textarea>
                <div style="font-size:11px;color:#888;margin-top:4px;" id="sw-descinput-count">${(value || '').length} символов</div>
                <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end;">
                    <button id="sw-descinput-cancel" style="padding:8px 18px;border-radius:10px;border:none;cursor:pointer;font-size:13px;background:rgba(255,255,255,0.08);color:#aaa;">Отмена</button>
                    <button id="sw-descinput-save" style="padding:8px 18px;border-radius:10px;border:none;cursor:pointer;font-size:13px;background:rgba(244,114,182,0.25);color:#f472b6;font-weight:500;">Сохранить</button>
                </div>`;
            ov.appendChild(m);
            swGetModalContainer().appendChild(ov);

            const textarea = m.querySelector('#sw-descinput-text');
            const counter = m.querySelector('#sw-descinput-count');
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
            textarea.addEventListener('input', () => { counter.textContent = `${textarea.value.length} символов`; });

            const close = (val) => { ov.remove(); resolve(val); };
            m.querySelector('#sw-descinput-cancel').addEventListener('click', () => close(null));
            m.querySelector('#sw-descinput-save').addEventListener('click', () => close(textarea.value.trim()));
            ov.addEventListener('click', (e) => { if (e.target === ov) close(null); });
            document.addEventListener('keydown', function escH(e) {
                if (e.key === 'Escape') { close(null); document.removeEventListener('keydown', escH); }
            });
        });
    }

    // ── Edit modal (custom, replaces browser prompts) ──
    function swShowEditModal(item) {
        return new Promise((resolve) => {
            swInjectV4Styles();
                        const ov = document.createElement('div');
            ov.className = 'sw-edit-modal-overlay';
            const m = document.createElement('div');
            m.className = 'sw-edit-modal';
            let tagsHtml = '';
            for (const tag of TAG_KEYS) {
                const checked = Array.isArray(item.tags) && item.tags.includes(tag) ? 'checked' : '';
                tagsHtml += `<label class="sw-upload-tag"><input type="checkbox" value="${tag}" ${checked}> ${esc(TAGS[tag])}</label>`;
            }
            let catOptions = '';
            for (const cat of CAT_KEYS) {
                catOptions += `<option value="${cat}" ${item.category === cat ? 'selected' : ''}>${esc(CATEGORIES[cat])}</option>`;
            }
            m.innerHTML = `
                <h3>\u270F\uFE0F Редактировать</h3>
                <label>Название</label>
                <input type="text" id="sw-edit-name" value="${esc(item.name)}">
                <label>Описание</label>
                <textarea id="sw-edit-desc">${esc(item.description || '')}</textarea>
                <label>Категория</label>
                <select id="sw-edit-cat">${catOptions}</select>
                <label>Для кого</label>
                <select id="sw-edit-forwho"><option value="all" ${(item.forWho || 'all') === 'all' ? 'selected' : ''}>Все</option><option value="bot" ${item.forWho === 'bot' ? 'selected' : ''}>Бот</option><option value="user" ${item.forWho === 'user' ? 'selected' : ''}>Юзер</option></select>
                <label>Теги</label>
                <div class="sw-upload-tags" id="sw-edit-tags">${tagsHtml}</div>
                <div class="sw-upload-btns">
                    <button class="sw-upload-btn sw-upload-btn-cancel" id="sw-edit-cancel">Отмена</button>
                    <button class="sw-upload-btn sw-upload-btn-save" id="sw-edit-save">Сохранить</button>
                </div>`;
            ov.appendChild(m);
            swGetModalContainer().appendChild(ov);

            const close = (val) => { ov.remove(); resolve(val); };
            m.querySelector('#sw-edit-cancel').addEventListener('click', () => close(null));
            ov.addEventListener('click', (e) => { if (e.target === ov) close(null); });
            m.querySelector('#sw-edit-save').addEventListener('click', () => {
                const name = m.querySelector('#sw-edit-name').value.trim();
                if (!name) { toastr.warning('Введите название', 'Гардероб'); return; }
                const description = m.querySelector('#sw-edit-desc').value.trim();
                const category = m.querySelector('#sw-edit-cat').value;
                const forWho = m.querySelector('#sw-edit-forwho').value;
                const tags = [...m.querySelectorAll('#sw-edit-tags input:checked')].map(c => c.value);
                close({ name, description, category, forWho, tags });
            });
            document.addEventListener('keydown', function escHandler(e) {
                if (e.key === 'Escape') { close(null); document.removeEventListener('keydown', escHandler); }
            });
            setTimeout(() => m.querySelector('#sw-edit-name')?.focus(), 50);
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
        const maxTokens = (category === 'hair') ? 60 : 150;
        swLog('INFO', `swAnalyzeOutfit: mode=${mode}, promptStyle=${promptStyle}, maxLen=${maxDescLen}`);
        toastr.info('Анализ образа...', 'Гардероб', { timeOut: 15000 });

        // ── Direct API mode (recommended) ──
        if (mode === 'direct') {
            const iigSettings = SillyTavern.getContext().extensionSettings[MODULE_NAME] || {};
            const endpoint = (swS.describeEndpoint || iigSettings.endpoint || '').replace(/\/$/, '');
            const apiKey = swS.describeKey || iigSettings.apiKey || '';
            const modelSelect = document.getElementById('slay_sw_describe_model');
            const model = modelSelect?.value || swS.describeModel || iigSettings.model || 'gemini-2.0-flash';
            if (!endpoint || !apiKey) {
                toastr.warning('Настройте API для описания в секции Гардероб', 'Гардероб', { timeOut: 5000 });
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

                if (useGeminiFormat) {
                    const url = `${endpoint}/v1beta/models/${model}:generateContent`;
                    const body = {
                        contents: [{ role: 'user', parts: [
                            { inlineData: { mimeType: 'image/png', data: base64 } },
                            { text: describePrompt }
                        ]}],
                        generationConfig: { responseModalities: ['TEXT'], maxOutputTokens: maxTokens }
                    };
                    const response = await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                    if (!response.ok) throw new Error(`API ${response.status}`);
                    const result = await response.json();
                    desc = result.candidates?.[0]?.content?.parts?.find(p => p.text)?.text?.trim() || '';
                } else {
                    const url = `${endpoint}/v1/chat/completions`;
                    const body = {
                        model, max_tokens: maxTokens,
                        messages: [
                            { role: 'system', content: describePrompt },
                            { role: 'user', content: [
                                { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } },
                                { type: 'text', text: 'Describe the clothing in this image.' }
                            ]}
                        ]
                    };
                    const response = await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                    if (!response.ok) throw new Error(`API ${response.status}`);
                    const result = await response.json();
                    desc = result.choices?.[0]?.message?.content?.trim() || '';
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
            return null;
        }

        // ── Chat API mode ──
        const ctx = SillyTavern.getContext();

        if (typeof ctx.generateRaw === 'function') {
            try {
                const messages = [
                    { role: 'system', content: describePrompt },
                    { role: 'user', content: [
                        { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } },
                        { type: 'text', text: 'Describe the clothing in this image.' },
                    ]},
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
        return null;
    }

    async function swUpload() {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
        inp.addEventListener('change', async () => {
            const f = inp.files?.[0]; if (!f) return;
            const defaultName = f.name.replace(/\.[^.]+$/, '');

            // Show upload modal
            const result = await swShowUploadModal(defaultName);
            if (!result) return;

            try {
                const { base64 } = await swResize(f, swGetSettings().maxDimension);
                let autoDesc = null;
                if (swGetSettings().autoDescribe !== false) {
                    autoDesc = await swAnalyzeOutfit(base64, result.category);
                }
                if (autoDesc) {
                    const edited = await swShowDescInput('🤖 Описание (можете отредактировать)', autoDesc);
                    if (edited !== null) autoDesc = edited;
                }
                const imagePath = await swSaveImageToFile(base64, `wardrobe_${result.name}`);
                swAddItem({
                    id: uid(),
                    name: result.name,
                    description: (autoDesc || '').trim(),
                    imagePath,
                    base64: '',
                    category: result.category,
                    forWho: result.forWho || 'all',
                    tags: result.tags,
                    addedAt: Date.now(),
                });
                // Switch to the uploaded item's category
                swCatTab = result.category;
                swRender();
                toastr.success(`\u00AB${result.name}\u00BB добавлен`, 'Гардероб');
            } catch (e) { toastr.error('Ошибка: ' + e.message, 'Гардероб'); }
        });
        inp.click();
    }

    async function swEdit(id) {
        const o = swFindItem(id); if (!o) return;
        const result = await swShowEditModal(o);
        if (!result) return;
        o.name = result.name || o.name;
        o.description = result.description ?? o.description;
        o.category = result.category || o.category;
        o.forWho = result.forWho || 'all';
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
    function swInjectFloatingBtn() {
        let $btn = $('#sw-bar-btn');
        if ($btn.length === 0) {
            $btn = $('<div id="sw-bar-btn" title="Гардероб"><i class="fa-solid fa-shirt"></i></div>');
            $btn.on('click touchend', function(e) { e.preventDefault(); e.stopPropagation(); swOpenModal(); });
            const $left = $('#leftSendForm');
            if ($left.length) $left.append($btn); else $('body').append($btn);
        }
        const co = swGetCharOutfit();
        let count = 0;
        if (co) {
            for (const type of ['bot', 'user']) {
                for (const cat of CAT_KEYS) {
                    if (co[type]?.[cat]) count++;
                }
            }
        }
        $btn.toggleClass('sw-bar-active', count > 0);
        if (count > 0) {
            $btn.html(`<i class="fa-solid fa-shirt"></i><span class="sw-bar-count">${count}</span>`);
        } else { $btn.html('<i class="fa-solid fa-shirt"></i>'); }
        $btn.show();
    }

    // ── Public API ──
    window.slayWardrobe = {
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
    };

    // ── Init hooks ──
    const ctx = SillyTavern.getContext();
    ctx.eventSource.on(ctx.event_types.APP_READY, () => {
        setTimeout(() => { swUpdatePromptInjection(); swInjectFloatingBtn(); }, 500);
    });
    ctx.eventSource.on(ctx.event_types.CHAT_CHANGED, () => {
        setTimeout(() => { swUpdatePromptInjection(); swInjectFloatingBtn(); }, 300);
    });
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
    imageContextCount: 1,
    apiType: 'openai',
    endpoint: '',
    apiKey: '',
    model: '',
    size: '1024x1024',
    quality: 'standard',
    maxRetries: 0,
    retryDelay: 1000,
    // Gemini/nano-banana
    sendCharAvatar: false,
    sendUserAvatar: false,
    userAvatarFile: '',
    aspectRatio: '1:1',
    imageSize: '1K',
    // Naistera
    naisteraAspectRatio: '1:1',
    naisteraPreset: '',
    naisteraModel: 'grok',
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
const NAISTERA_MODELS = Object.freeze(['grok', 'nano banana']);
const DEFAULT_ENDPOINTS = Object.freeze({ naistera: 'https://naistera.org' });
const ENDPOINT_PLACEHOLDERS = Object.freeze({ openai: 'https://api.openai.com', gemini: 'https://generativelanguage.googleapis.com', naistera: 'https://naistera.org' });

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

function saveSettings() {
    const context = SillyTavern.getContext();
    if (typeof window.saveSettings === 'function') {
        try { window.saveSettings(); } catch(e) { context.saveSettingsDebounced(); }
    } else { context.saveSettingsDebounced(); }
    persistRefsToLocalStorage();
}
function saveSettingsNow() { saveSettings(); }

const LS_KEY = 'slay_iig_refs_v1';

function persistRefsToLocalStorage() {
    try {
        const settings = getSettings();
        const refs = JSON.parse(JSON.stringify(settings.npcReferences || {}));
        localStorage.setItem(LS_KEY, JSON.stringify(refs));
    } catch(e) { iigLog('WARN', 'persistRefsToLocalStorage failed:', e.message); }
}

function restoreRefsFromLocalStorage() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return;
        const backup = JSON.parse(raw);
        if (!backup || typeof backup !== 'object') return;
        const settings = getSettings();
        settings.npcReferences = backup;
        iigLog('INFO', 'Refs restored from localStorage');
    } catch(e) { iigLog('WARN', 'restoreRefsFromLocalStorage failed:', e.message); }
}

function initMobileSaveListeners() {
    const flush = () => {
        persistRefsToLocalStorage();
        try { SillyTavern.getContext().saveSettingsDebounced(); } catch(e) {}
        if (typeof window.saveSettings === 'function') { try { window.saveSettings(); } catch(e) {} }
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

function matchNpcReferences(prompt, npcList) {
    if (!prompt || !npcList || npcList.length === 0) return [];
    const lowerPrompt = prompt.toLowerCase();
    const matched = [];
    for (const npc of npcList) {
        if (!npc || !npc.name || (!npc.imagePath && !npc.imageBase64 && !npc.imageData)) continue;
        const words = npc.name.trim().split(/\s+/).filter(w => w.length > 2);
        if (words.length === 0) continue;
        if (words.some(word => lowerPrompt.includes(word.toLowerCase()))) {
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
    message.mes = (message.mes || '').replace(tag.fullMatch, replacement);
    if (message.extra?.display_text) message.extra.display_text = message.extra.display_text.replace(tag.fullMatch, replacement);
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

async function collectPreviousContextReferences(messageId, format, requestedCount) {
    const urls = getPreviousGeneratedImageUrls(messageId, requestedCount);
    if (urls.length === 0) return [];
    const convert = format === 'dataUrl' ? imageUrlToDataUrl : imageUrlToBase64;
    const converted = await Promise.all(urls.map(url => convert(url)));
    return converted.filter(Boolean);
}

// ── Image utilities ──
function compressBase64Image(rawBase64, maxDim = 768, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let w = img.width, h = img.height;
            if (w > maxDim || h > maxDim) { const scale = maxDim / Math.max(w, h); w = Math.round(w * scale); h = Math.round(h * scale); }
            const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            const b64 = dataUrl.split(',')[1];
            iigLog('INFO', `Compressed: ${img.width}x${img.height} -> ${w}x${h}, ~${Math.round(b64.length / 1024)}KB`);
            resolve(b64);
        };
        img.onerror = () => reject(new Error('Failed to load image for compression'));
        img.src = 'data:image/jpeg;base64,' + rawBase64;
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

async function saveRefImageToFile(base64Data, label) {
    const context = SillyTavern.getContext();
    const safeName = label.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
    const filename = `iig_ref_${safeName}_${Date.now()}`;
    const response = await fetch('/api/images/upload', {
        method: 'POST', headers: context.getRequestHeaders(),
        body: JSON.stringify({ image: base64Data, format: 'jpeg', ch_name: 'iig_refs', filename })
    });
    if (!response.ok) { const err = await response.json().catch(() => ({ error: 'Unknown' })); throw new Error(err.error || `Upload failed: ${response.status}`); }
    const result = await response.json();
    iigLog('INFO', `Ref saved: ${result.path}`);
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
    } catch(e) { iigLog('WARN', `loadRefImageAsBase64 failed for ${path}:`, e.message); return null; }
}

// ── Avatar helpers (from sillyimages-master) ──
async function getCharacterAvatarBase64() {
    try {
        const context = SillyTavern.getContext();
        if (context.characterId === undefined || context.characterId === null) return null;
        if (typeof context.getCharacterAvatar === 'function') {
            const avatarUrl = context.getCharacterAvatar(context.characterId);
            if (avatarUrl) return await imageUrlToBase64(avatarUrl);
        }
        const character = context.characters?.[context.characterId];
        if (character?.avatar) return await imageUrlToBase64(`/characters/${encodeURIComponent(character.avatar)}`);
        return null;
    } catch (error) { console.error('[IIG] getCharacterAvatarBase64 error:', error); return null; }
}

async function getCharacterAvatarDataUrl() {
    try {
        const context = SillyTavern.getContext();
        if (context.characterId === undefined || context.characterId === null) return null;
        if (typeof context.getCharacterAvatar === 'function') {
            const avatarUrl = context.getCharacterAvatar(context.characterId);
            if (avatarUrl) return await imageUrlToDataUrl(avatarUrl);
        }
        const character = context.characters?.[context.characterId];
        if (character?.avatar) return await imageUrlToDataUrl(`/characters/${encodeURIComponent(character.avatar)}`);
        return null;
    } catch (error) { console.error('[IIG] getCharacterAvatarDataUrl error:', error); return null; }
}

async function getUserAvatarBase64() {
    try {
        const context = SillyTavern.getContext();
        const settings = getSettings();
        const currentAvatar = context.user_avatar;
        if (currentAvatar) {
            const b64 = await imageUrlToBase64(`/User Avatars/${encodeURIComponent(currentAvatar)}`);
            if (b64) return b64;
        }
        const userMsgAvatar = document.querySelector('#chat .mes[is_user="true"] .avatar img');
        if (userMsgAvatar?.src) { const b64 = await imageUrlToBase64(userMsgAvatar.src); if (b64) return b64; }
        if (settings.userAvatarFile) return await imageUrlToBase64(`/User Avatars/${encodeURIComponent(settings.userAvatarFile)}`);
        return null;
    } catch (error) { console.error('[IIG] getUserAvatarBase64 error:', error); return null; }
}

async function getUserAvatarDataUrl() {
    try {
        const context = SillyTavern.getContext();
        const settings = getSettings();
        const currentAvatar = context.user_avatar;
        if (currentAvatar) { const d = await imageUrlToDataUrl(`/User Avatars/${encodeURIComponent(currentAvatar)}`); if (d) return d; }
        const userMsgAvatar = document.querySelector('#chat .mes[is_user="true"] .avatar img');
        if (userMsgAvatar?.src) { const d = await imageUrlToDataUrl(userMsgAvatar.src); if (d) return d; }
        if (settings.userAvatarFile) return await imageUrlToDataUrl(`/User Avatars/${encodeURIComponent(settings.userAvatarFile)}`);
        return null;
    } catch (error) { console.error('[IIG] getUserAvatarDataUrl error:', error); return null; }
}

async function fetchUserAvatars() {
    try {
        const context = SillyTavern.getContext();
        const response = await fetch('/api/avatars/get', { method: 'POST', headers: context.getRequestHeaders() });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) { console.error('[IIG] fetchUserAvatars failed:', error); return []; }
}

async function fetchModels() {
    const settings = getSettings();
    const endpoint = settings.endpoint ? settings.endpoint.replace(/\/$/, '') : getEffectiveEndpoint(settings);
    if (!endpoint || !settings.apiKey) {
        console.warn('[IIG] Cannot fetch models: endpoint=' + endpoint + ' apiKey=' + (settings.apiKey ? 'set' : 'empty'));
        toastr.warning('Укажите endpoint и API key', 'SLAY Images');
        return [];
    }
    const url = `${endpoint}/v1/models`;
    try {
        const response = await fetch(url, { method: 'GET', headers: { 'Authorization': `Bearer ${settings.apiKey}` } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return (data.data || []).filter(m => isImageModel(m.id)).map(m => m.id);
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
        let pe = {}; try { pe = raw ? JSON.parse(raw) : {}; } catch(_) {}
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

async function generateImageOpenAI(prompt, style, referenceImages = [], options = {}) {
    const settings = getSettings();
    const url = `${settings.endpoint.replace(/\/$/, '')}/v1/images/generations`;
    const fullPrompt = style ? `[Style: ${style}] ${prompt}` : prompt;
    let size = settings.size;
    if (options.aspectRatio) {
        if (options.aspectRatio === '16:9') size = '1792x1024';
        else if (options.aspectRatio === '9:16') size = '1024x1792';
        else if (options.aspectRatio === '1:1') size = '1024x1024';
    }
    const body = { model: settings.model, prompt: fullPrompt, n: 1, size, quality: options.quality || settings.quality, response_format: 'b64_json' };
    if (referenceImages.length > 0) body.image = `data:image/png;base64,${referenceImages[0]}`;
    const response = await robustFetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) { const text = await response.text(); throw new Error(`API Error (${response.status}): ${text}`); }
    const result = await response.json();
    const dataList = result.data || [];
    if (dataList.length === 0) { if (result.url) return result.url; throw new Error('No image data in response'); }
    const imageObj = dataList[0];
    if (imageObj.b64_json) return `data:image/png;base64,${imageObj.b64_json}`;
    return imageObj.url;
}

async function generateImageGemini(prompt, style, referenceImages = [], options = {}) {
    const settings = getSettings();
    const model = settings.model;
    const url = `${settings.endpoint.replace(/\/$/, '')}/v1beta/models/${model}:generateContent`;
    let aspectRatio = options.aspectRatio || settings.aspectRatio || '1:1';
    if (!VALID_ASPECT_RATIOS.includes(aspectRatio)) aspectRatio = VALID_ASPECT_RATIOS.includes(settings.aspectRatio) ? settings.aspectRatio : '1:1';
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

    let fullPrompt = style ? `[Style: ${style}] ${prompt}` : prompt;

    if (instructions.length > 0) {
        const refBlock = instructions.join('\n') + '\nGenerate the scene below. Keep all faces and outfits faithful to the references.';
        fullPrompt = `${refBlock}\n\n${fullPrompt}`;
    }

    parts.push({ text: fullPrompt });

    const body = { contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio, imageSize } } };
    iigLog('INFO', `Gemini: model=${model}, ratio=${aspectRatio}, size=${imageSize}, refs=${referenceImages.length}`);

    const response = await robustFetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
    const fullPrompt = style ? `[Style: ${style}] ${prompt}` : prompt;
    const aspectRatio = options.aspectRatio || settings.naisteraAspectRatio || '1:1';
    const model = normalizeNaisteraModel(options.model || settings.naisteraModel || 'grok');
    const referenceImages = options.referenceImages || [];
    const wantsVideoTest = Boolean(options.videoTestMode);
    const videoEveryN = normalizeNaisteraVideoFrequency(options.videoEveryN ?? settings.naisteraVideoEveryN);

    const body = { prompt: fullPrompt, aspect_ratio: aspectRatio, model };
    if (options.preset) body.preset = options.preset;
    if (referenceImages.length > 0) body.reference_images = referenceImages.slice(0, MAX_GENERATION_REFERENCE_IMAGES);
    if (wantsVideoTest) { body.video_test_mode = true; body.video_test_every_n_messages = videoEveryN; }

    let response;
    try {
        response = await robustFetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch (error) {
        const pageOrigin = window.location.origin;
        let endpointOrigin = endpoint;
        try { endpointOrigin = new URL(url, window.location.href).origin; } catch (pe) {}
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
    if (settings.apiType !== 'naistera' && !settings.model) errors.push('Модель не выбрана');
    if (settings.apiType === 'naistera') {
        const m = normalizeNaisteraModel(settings.naisteraModel);
        if (!NAISTERA_MODELS.includes(m)) errors.push('Для Naistera выберите модель: grok / nano banana');
    }
    if (errors.length > 0) throw new Error(`Ошибка настроек: ${errors.join(', ')}`);
}

function sanitizeForHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }

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

function buildPersistedVideoTag(templateHtml, persistedSrc, posterSrc = '') {
    let html = String(templateHtml || '').trim()
        .replace(/^<(?:img|video)\b/i, '<video controls autoplay loop muted playsinline')
        .replace(/<\/video>\s*$/i, '').replace(/\/?>\s*$/i, '')
        .replace(/src\s*=\s*(['"])[^'"]*\1/i, `src="${persistedSrc}"`);
    html = html.replace(/\s+poster\s*=\s*(['"])[\s\S]*?\1/i, '');
    if (posterSrc) html = html.replace(/^<video\b/i, `<video poster="${sanitizeForHtml(posterSrc)}"`);
    return `${html}></video>`;
}

// ╔═════════════════════════════════════════════════════════════╗
// ║  generateImageWithRetry — THE CRITICAL MERGE POINT          ║
// ╚═════════════════════════════════════════════════════════════╝

async function generateImageWithRetry(prompt, style, onStatusUpdate, options = {}) {
    validateSettings();
    const settings = getSettings();
    const maxRetries = settings.maxRetries;
    const baseDelay = settings.retryDelay;

    const referenceImages = [];
    const referenceDataUrls = [];
    const refLabels = [];
    const refNames = []; // parallel array with display names
    const swS = SillyTavern.getContext().extensionSettings.slay_wardrobe || {};

    // ── Gemini/nano-banana: base64 refs with labels ──
    if (settings.apiType === 'gemini' || isGeminiModel(settings.model)) {
        const refs = getCurrentCharacterRefs();
        const charDisplayName = refs.charRef?.name || getActiveCharacterName() || 'Character';
        const userDisplayName = refs.userRef?.name || 'User';

        // Check which characters are mentioned in the prompt
        const lowerPrompt = prompt.toLowerCase();
        const charNameWords = charDisplayName.split(/\s+/).filter(w => w.length > 2);
        const userNameWords = userDisplayName.split(/\s+/).filter(w => w.length > 2);
        const charInPrompt = charNameWords.length > 0 && charNameWords.some(w => lowerPrompt.includes(w.toLowerCase()));
        const userInPrompt = userNameWords.length > 0 && userNameWords.some(w => lowerPrompt.includes(w.toLowerCase()));

        iigLog('INFO', `Prompt mentions: char "${charDisplayName}"=${charInPrompt}, user "${userDisplayName}"=${userInPrompt}`);

        const getB64 = async (ref) => {
            if (ref?.imagePath) { const b64 = await loadRefImageAsBase64(ref.imagePath); if (b64) return b64; }
            return ref?.imageBase64 || ref?.imageData || null;
        };

        // 1. Character face + outfit (only if mentioned in prompt)
        if (charInPrompt) {
            if (settings.sendCharAvatar) {
                const charAvatar = await getCharacterAvatarBase64();
                if (charAvatar) { referenceImages.push(charAvatar); refLabels.push('char_face'); refNames.push(charDisplayName); }
            }
            let charOutfitSent = false;
            if (swS.sendOutfitImageBot !== false && window.slayWardrobe?.isReady()) {
                const botB64 = await window.slayWardrobe.getActiveOutfitBase64('bot');
                if (botB64) { referenceImages.push(botB64); refLabels.push('char_outfit'); refNames.push(charDisplayName); charOutfitSent = true; }
            }
            if (!charOutfitSent && swS.experimentalCollage && window.slayWardrobe?.getCollageBase64) {
                const collageB64 = await window.slayWardrobe.getCollageBase64('bot');
                if (collageB64) { referenceImages.push(collageB64); refLabels.push('char_outfit'); refNames.push(charDisplayName); iigLog('INFO', 'Collage sent for char'); }
            }
            if (!settings.sendCharAvatar) {
                const charB64 = await getB64(refs.charRef);
                if (charB64) { referenceImages.push(charB64); refLabels.push('npc_char'); refNames.push(charDisplayName); }
            }
        }

        // 2. User face + outfit (only if mentioned in prompt)
        if (userInPrompt) {
            if (settings.sendUserAvatar) {
                const userAvatar = await getUserAvatarBase64();
                if (userAvatar) { referenceImages.push(userAvatar); refLabels.push('user_face'); refNames.push(userDisplayName); }
            }
            let userOutfitSent = false;
            if (swS.sendOutfitImageUser !== false && window.slayWardrobe?.isReady()) {
                const userB64 = await window.slayWardrobe.getActiveOutfitBase64('user');
                if (userB64) { referenceImages.push(userB64); refLabels.push('user_outfit'); refNames.push(userDisplayName); userOutfitSent = true; }
            }
            if (!userOutfitSent && swS.experimentalCollage && window.slayWardrobe?.getCollageBase64) {
                const collageB64 = await window.slayWardrobe.getCollageBase64('user');
                if (collageB64) { referenceImages.push(collageB64); refLabels.push('user_outfit'); refNames.push(userDisplayName); iigLog('INFO', 'Collage sent for user'); }
            }
            if (!settings.sendUserAvatar) {
                const userB64 = await getB64(refs.userRef);
                if (userB64) { referenceImages.push(userB64); refLabels.push('npc_user'); refNames.push(userDisplayName); }
            }
        }
        // 6. Matched NPCs
        const matchedNpcs = matchNpcReferences(prompt, refs.npcReferences || []);
        for (const npc of matchedNpcs) {
            if (referenceImages.length >= MAX_GENERATION_REFERENCE_IMAGES) break;
            const b64 = npc.imagePath ? await loadRefImageAsBase64(npc.imagePath) : (npc.imageBase64 || npc.imageData);
            if (b64) { referenceImages.push(b64); refLabels.push('npc_matched'); refNames.push(npc.name || 'NPC'); iigLog('INFO', `NPC matched: ${npc.name}`); }
        }
        // 7. Context images
        if (settings.imageContextEnabled) {
            const contextCount = normalizeImageContextCount(settings.imageContextCount);
            const contextRefs = await collectPreviousContextReferences(options.messageId, 'base64', contextCount);
            for (const cr of contextRefs) { referenceImages.push(cr); refLabels.push('context'); refNames.push(''); }
        }
    }

    // ── Naistera: data URL refs ──
    if (settings.apiType === 'naistera') {
        if (settings.naisteraSendCharAvatar) { const d = await getCharacterAvatarDataUrl(); if (d) referenceDataUrls.push(d); }
        if (settings.naisteraSendUserAvatar) { const d = await getUserAvatarDataUrl(); if (d) referenceDataUrls.push(d); }
        if (window.slayWardrobe?.isReady()) {
            if (swS.sendOutfitImageBot !== false) { const botB64 = await window.slayWardrobe.getActiveOutfitBase64('bot'); if (botB64) referenceDataUrls.push(`data:image/png;base64,${botB64}`); }
            if (swS.sendOutfitImageUser !== false) { const userB64 = await window.slayWardrobe.getActiveOutfitBase64('user'); if (userB64) referenceDataUrls.push(`data:image/png;base64,${userB64}`); }
        }
        const refs = getCurrentCharacterRefs();
        const getDataUrl = async (ref) => {
            if (ref?.imagePath) { const b64 = await loadRefImageAsBase64(ref.imagePath); if (b64) return 'data:image/jpeg;base64,' + b64; }
            const b64 = ref?.imageBase64 || ref?.imageData;
            return b64 ? 'data:image/jpeg;base64,' + b64 : null;
        };
        if (!settings.naisteraSendCharAvatar) { const u = await getDataUrl(refs.charRef); if (u) referenceDataUrls.push(u); }
        if (!settings.naisteraSendUserAvatar) { const u = await getDataUrl(refs.userRef); if (u) referenceDataUrls.push(u); }
        const matchedNpcs = matchNpcReferences(prompt, refs.npcReferences || []);
        for (const npc of matchedNpcs) {
            if (referenceDataUrls.length >= MAX_GENERATION_REFERENCE_IMAGES) break;
            const url = await getDataUrl(npc);
            if (url) { referenceDataUrls.push(url); iigLog('INFO', `NPC (naistera): ${npc.name}`); }
        }
        if (settings.imageContextEnabled) {
            const contextRefs = await collectPreviousContextReferences(options.messageId, 'dataUrl', normalizeImageContextCount(settings.imageContextCount));
            referenceDataUrls.push(...contextRefs);
        }
    }

    // ── OpenAI: wardrobe + NPC refs ──
    if (settings.apiType !== 'gemini' && !isGeminiModel(settings.model) && settings.apiType !== 'naistera') {
        if (window.slayWardrobe?.isReady()) {
            if (swS.sendOutfitImageBot !== false) { const botB64 = await window.slayWardrobe.getActiveOutfitBase64('bot'); if (botB64) referenceImages.push(botB64); }
            if (swS.sendOutfitImageUser !== false) { const userB64 = await window.slayWardrobe.getActiveOutfitBase64('user'); if (userB64) referenceImages.push(userB64); }
        }
    }

    // Trim
    if (referenceImages.length > MAX_GENERATION_REFERENCE_IMAGES) { referenceImages.length = MAX_GENERATION_REFERENCE_IMAGES; refLabels.length = MAX_GENERATION_REFERENCE_IMAGES; }
    if (referenceDataUrls.length > MAX_GENERATION_REFERENCE_IMAGES) referenceDataUrls.length = MAX_GENERATION_REFERENCE_IMAGES;

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
        if (botDesc) wardrobeParts.push(`[Clothing reference only, avoid copying the pose] [Character's current outfit: ${botDesc}]`);
        if (userDesc) wardrobeParts.push(`[Clothing reference only, avoid copying the pose] [User's current outfit: ${userDesc}]`);
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
                generated = await generateImageNaistera(prompt, style, { ...options, referenceImages: referenceDataUrls, videoTestMode: enableVideoTest, videoEveryN: settings.naisteraVideoEveryN });
            } else if (settings.apiType === 'gemini' || isGeminiModel(settings.model)) {
                generated = await generateImageGemini(prompt, style, referenceImages, { ...options, refLabels, refNames });
            } else {
                generated = await generateImageOpenAI(prompt, style, referenceImages, options);
            }

            if (isGeneratedVideoResult(generated)) {
                iigLog('INFO', `Result: video, mime=${generated.contentType}`);
            } else if (typeof generated === 'string' && generated.startsWith('data:')) {
                try { const p = parseImageDataUrl(generated); iigLog('INFO', `Result: mime=${p.mimeType} b64len=${p.base64Data.length}`); } catch (e) {}
            }
            return generated;
        } catch (error) {
            lastError = error;
            console.error(`[IIG] Attempt ${attempt + 1} failed:`, error);
            const isRetryable = error.message?.includes('429') || error.message?.includes('503') || error.message?.includes('502') || error.message?.includes('504') || error.message?.includes('timeout') || error.message?.includes('network');
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

async function checkFileExists(path) { try { const r = await fetch(path, { method: 'HEAD' }); return r.ok; } catch(e) { return false; } }

// ── Error image path ──
let _cachedErrorImagePath = null;
function getErrorImagePath() {
    if (_cachedErrorImagePath) return _cachedErrorImagePath;
    const scripts = document.querySelectorAll('script[src*="index.js"]');
    for (const script of scripts) {
        const src = script.getAttribute('src') || '';
        if (src.includes('slay') || src.includes('sillyimages') || src.includes('notsosillynotsoimages') || src.includes('inline_image_gen')) {
            _cachedErrorImagePath = `${src.substring(0, src.lastIndexOf('/'))}/error.svg`;
            return _cachedErrorImagePath;
        }
    }
    const links = document.querySelectorAll('link[rel="stylesheet"][href*="style.css"]');
    for (const link of links) {
        const href = link.getAttribute('href') || '';
        if (href.includes('slay') || href.includes('sillyimages') || href.includes('notsosillynotsoimages')) {
            _cachedErrorImagePath = `${href.substring(0, href.lastIndexOf('/'))}/error.svg`;
            return _cachedErrorImagePath;
        }
    }
    const possiblePaths = [
        '/scripts/extensions/third-party/SLAYImages/error.svg',
        '/scripts/extensions/third-party/SLAYImages_v4_draft/error.svg',
        '/scripts/extensions/third-party/SLAYImages_v4_collage/error.svg',
        '/scripts/extensions/third-party/notsosillynotsoimages/error.svg',
        '/scripts/extensions/third-party/sillyimages/error.svg',
    ];
    _cachedErrorImagePath = possiblePaths[0];
    (async () => {
        for (const path of possiblePaths) {
            try { const resp = await fetch(path, { method: 'HEAD' }); if (resp.ok) { _cachedErrorImagePath = path; return; } } catch(e) {}
        }
    })();
    return _cachedErrorImagePath;
}

// ── Loading / Error placeholders ──
function createLoadingPlaceholder(tagId) {
    const placeholder = document.createElement('div');
    placeholder.className = 'iig-loading-placeholder';
    placeholder.dataset.tagId = tagId;
    placeholder.innerHTML = `<div class="iig-spinner-wrap"><div class="iig-spinner"></div></div><div class="iig-status">Генерация картинки...</div><div class="iig-timer"></div>`;
    const timerEl = placeholder.querySelector('.iig-timer');
    const startTime = Date.now();
    const tSec = FETCH_TIMEOUT / 1000;
    placeholder._timerInterval = setInterval(() => {
        const el = Math.floor((Date.now() - startTime) / 1000);
        if (el >= tSec) { timerEl.textContent = "Timeout..."; clearInterval(placeholder._timerInterval); return; }
        const m = Math.floor(el/60), s = el%60;
        timerEl.textContent = `${m}:${String(s).padStart(2,"0")} / ${Math.floor(tSec/60)}:00${IS_IOS ? " (iOS)" : ""}`;
    }, 1000);
    return placeholder;
}

function createErrorPlaceholder(tagId, errorMessage, tagInfo) {
    const img = document.createElement('img');
    img.className = 'iig-error-image'; img.src = getErrorImagePath(); img.alt = 'Generation error'; img.title = `Error: ${errorMessage}`; img.dataset.tagId = tagId;
    if (tagInfo.fullMatch) {
        const instructionMatch = tagInfo.fullMatch.match(/data-iig-instruction\s*=\s*(?:(['"]))([\s\S]*?)\1/i) || tagInfo.fullMatch.match(/data-iig-instruction\s*=\s*([{][\s\S]*?[}])(?:\s|>)/i);
        if (instructionMatch) img.setAttribute('data-iig-instruction', instructionMatch[2] || instructionMatch[1]);
    }
    return img;
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
                    try { const d = JSON.parse(decoded.replace(/'/g, '"')); if (d.prompt?.substring(0, 30) === tag.prompt.substring(0, 30)) { targetElement = img; break; } } catch(e) {}
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
        try {
            const result = await generateImageWithRetry(tag.prompt, tag.style, (s) => { statusEl.textContent = s; }, { aspectRatio: tag.aspectRatio, imageSize: tag.imageSize, quality: tag.quality, preset: tag.preset, messageId });

            statusEl.textContent = 'Сохранение...';

            if (isGeneratedVideoResult(result)) {
                const videoPath = await saveNaisteraMediaToFile(result.dataUrl, 'video');
                let posterPath = '';
                if (result.posterDataUrl) { try { posterPath = await saveImageToFile(result.posterDataUrl); } catch(e) {} }
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
                const errorTag = tag.fullMatch.replace(/src\s*=\s*(['"])[^'"]*\1/i, `src="${getErrorImagePath()}"`);
                replaceTagInMessageSource(message, tag, errorTag);
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
        } finally { processingMessages.delete(messageId); }
    }
}

async function regenerateMessageImages(messageId) {
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

    for (let index = 0; index < tags.length; index++) {
        const tag = tags[index];
        const tagId = `iig-regen-${messageId}-${index}`;
        try {
            const allInstructionImgs = mesTextEl.querySelectorAll('img[data-iig-instruction], video[data-iig-instruction]');
            const existingEl = allInstructionImgs[index] || null;
            if (existingEl) {
                const instruction = existingEl.getAttribute('data-iig-instruction');
                const loadingPlaceholder = createLoadingPlaceholder(tagId);
                existingEl.replaceWith(loadingPlaceholder);
                const statusEl = loadingPlaceholder.querySelector('.iig-status');
                const result = await generateImageWithRetry(tag.prompt, tag.style, (s) => { statusEl.textContent = s; }, { aspectRatio: tag.aspectRatio, imageSize: tag.imageSize, quality: tag.quality, preset: tag.preset, messageId });
                statusEl.textContent = 'Сохранение...';

                if (isGeneratedVideoResult(result)) {
                    const videoPath = await saveNaisteraMediaToFile(result.dataUrl, 'video');
                    const videoEl = createGeneratedMediaElement({ ...result, dataUrl: videoPath }, tag);
                    if (loadingPlaceholder._timerInterval) clearInterval(loadingPlaceholder._timerInterval);
                    loadingPlaceholder.replaceWith(videoEl);
                    const persisted = buildPersistedVideoTag(tag.fullMatch, videoPath);
                    message.mes = message.mes.replace(tag.fullMatch, persisted);
                } else {
                    const imagePath = await saveImageToFile(result);
                    const img = document.createElement('img');
                    img.className = 'iig-generated-image'; img.src = imagePath; img.alt = tag.prompt;
                    if (instruction) img.setAttribute('data-iig-instruction', instruction);
                    if (loadingPlaceholder._timerInterval) clearInterval(loadingPlaceholder._timerInterval);
                    loadingPlaceholder.replaceWith(img);
                    const updatedTag = tag.fullMatch.replace(/src\s*=\s*(['"])[^'"]*\1/i, `src="${imagePath}"`);
                    message.mes = message.mes.replace(tag.fullMatch, updatedTag);
                }
                toastr.success(`Картинка ${index + 1}/${tags.length} готова`, 'SLAY Images', { timeOut: 2000 });
            }
        } catch (error) {
            iigLog('ERROR', `Regen failed tag ${index}:`, error.message);
            toastr.error(`Ошибка: ${error.message}`, 'SLAY Images');
        }
    }

    processingMessages.delete(messageId);
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
    const charSlot = document.querySelector('.iig-ref-slot[data-ref-type="char"]');
    if (charSlot) { setThumb(charSlot, settings.charRef); charSlot.querySelector('.iig-ref-name').value = settings.charRef?.name || ''; }
    const userSlot = document.querySelector('.iig-ref-slot[data-ref-type="user"]');
    if (userSlot) { setThumb(userSlot, settings.userRef); userSlot.querySelector('.iig-ref-name').value = settings.userRef?.name || ''; }
    for (let i = 0; i < 4; i++) {
        const slot = document.querySelector(`.iig-ref-slot[data-ref-type="npc"][data-npc-index="${i}"]`);
        if (!slot) continue;
        const npc = settings.npcReferences[i] || null;
        setThumb(slot, npc);
        slot.querySelector('.iig-ref-name').value = npc?.name || '';
    }
}

function createSettingsUI() {
    const settings = getSettings();
    const container = document.getElementById('extensions_settings');
    if (!container) return;

    let npcSlotsHtml = '';
    for (let i = 0; i < 4; i++) {
        npcSlotsHtml += `<div class="iig-ref-slot" data-ref-type="npc" data-npc-index="${i}">
            <div class="iig-ref-thumb-wrap"><img src="" alt="NPC" class="iig-ref-thumb"><div class="iig-ref-empty-icon"><i class="fa-solid fa-user-plus"></i></div><label class="iig-ref-upload-overlay" title="Upload"><i class="fa-solid fa-camera"></i><input type="file" accept="image/*" class="iig-ref-file-input" style="display:none"></label></div>
            <div class="iig-ref-info"><div class="iig-ref-label">NPC ${i + 1}</div><input type="text" class="text_pole iig-ref-name" placeholder="Имя" value=""></div>
            <div class="iig-ref-actions"><label class="menu_button iig-ref-upload-btn" title="Upload"><i class="fa-solid fa-upload"></i><input type="file" accept="image/*" class="iig-ref-file-input" style="display:none"></label><div class="menu_button iig-ref-delete-btn" title="Удалить"><i class="fa-solid fa-trash-can"></i></div></div>
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
                <label class="checkbox_label"><input type="checkbox" id="slay_external_blocks" ${settings.externalBlocks ? 'checked' : ''}><span>External blocks (extblocks)</span></label>
                <hr>

                <!-- API -->
                <div class="iig-section">
                    <h4><i class="fa-solid fa-plug"></i> API</h4>
                    <div class="flex-row"><label>Тип API</label><select id="slay_api_type" class="flex1"><option value="openai" ${settings.apiType === 'openai' ? 'selected' : ''}>OpenAI-compatible</option><option value="gemini" ${settings.apiType === 'gemini' ? 'selected' : ''}>Gemini / Nano-Banana</option><option value="naistera" ${settings.apiType === 'naistera' ? 'selected' : ''}>Naistera / Grok</option></select></div>
                    <div class="flex-row"><label>Endpoint</label><input type="text" id="slay_endpoint" class="text_pole flex1" value="${sanitizeForHtml(settings.endpoint)}" placeholder="${getEndpointPlaceholder(settings.apiType)}"></div>
                    <div class="flex-row"><label>API Key</label><input type="password" id="slay_api_key" class="text_pole flex1" value="${sanitizeForHtml(settings.apiKey)}"><div id="slay_key_toggle" class="menu_button iig-key-toggle" title="Show/Hide"><i class="fa-solid fa-eye"></i></div></div>
                    <p id="slay_naistera_hint" class="hint ${settings.apiType === 'naistera' ? '' : 'iig-hidden'}">Naistera/Grok: вставьте токен из Telegram-бота.</p>
                    <div class="flex-row ${settings.apiType === 'naistera' ? 'iig-hidden' : ''}" id="slay_model_row"><label>Модель</label><select id="slay_model" class="flex1">${settings.model ? `<option value="${sanitizeForHtml(settings.model)}" selected>${sanitizeForHtml(settings.model)}</option>` : '<option value="">-- Выберите --</option>'}</select><div id="slay_refresh_models" class="menu_button iig-refresh-btn" title="Обновить"><i class="fa-solid fa-sync"></i></div></div>
                    <div id="slay_test_connection" class="menu_button iig-test-connection"><i class="fa-solid fa-wifi"></i> Тест</div>
                </div>
                <hr>

                <!-- Gen params -->
                <div class="iig-section">
                    <h4><i class="fa-solid fa-sliders"></i> Параметры генерации</h4>
                    <div class="flex-row ${settings.apiType !== 'openai' ? 'iig-hidden' : ''}" id="slay_size_row"><label>Размер</label><select id="slay_size" class="flex1"><option value="1024x1024" ${settings.size === '1024x1024' ? 'selected' : ''}>1024x1024</option><option value="1792x1024" ${settings.size === '1792x1024' ? 'selected' : ''}>1792x1024</option><option value="1024x1792" ${settings.size === '1024x1792' ? 'selected' : ''}>1024x1792</option><option value="512x512" ${settings.size === '512x512' ? 'selected' : ''}>512x512</option></select></div>
                    <div class="flex-row ${settings.apiType !== 'openai' ? 'iig-hidden' : ''}" id="slay_quality_row"><label>Качество</label><select id="slay_quality" class="flex1"><option value="standard" ${settings.quality === 'standard' ? 'selected' : ''}>Standard</option><option value="hd" ${settings.quality === 'hd' ? 'selected' : ''}>HD</option></select></div>
                    <div id="slay_gemini_params" class="${settings.apiType !== 'gemini' ? 'iig-hidden' : ''}">
                        <div class="flex-row"><label>Соотношение сторон</label><select id="slay_aspect_ratio" class="flex1"><option value="1:1" ${settings.aspectRatio === '1:1' ? 'selected' : ''}>1:1</option><option value="2:3" ${settings.aspectRatio === '2:3' ? 'selected' : ''}>2:3</option><option value="3:2" ${settings.aspectRatio === '3:2' ? 'selected' : ''}>3:2</option><option value="3:4" ${settings.aspectRatio === '3:4' ? 'selected' : ''}>3:4</option><option value="4:3" ${settings.aspectRatio === '4:3' ? 'selected' : ''}>4:3</option><option value="4:5" ${settings.aspectRatio === '4:5' ? 'selected' : ''}>4:5</option><option value="5:4" ${settings.aspectRatio === '5:4' ? 'selected' : ''}>5:4</option><option value="9:16" ${settings.aspectRatio === '9:16' ? 'selected' : ''}>9:16</option><option value="16:9" ${settings.aspectRatio === '16:9' ? 'selected' : ''}>16:9</option><option value="21:9" ${settings.aspectRatio === '21:9' ? 'selected' : ''}>21:9</option></select></div>
                        <div class="flex-row"><label>Разрешение</label><select id="slay_image_size" class="flex1"><option value="1K" ${settings.imageSize === '1K' ? 'selected' : ''}>1K</option><option value="2K" ${settings.imageSize === '2K' ? 'selected' : ''}>2K</option><option value="4K" ${settings.imageSize === '4K' ? 'selected' : ''}>4K</option></select></div>
                    </div>
                    <div class="flex-row ${settings.apiType === 'naistera' ? '' : 'iig-hidden'}" id="slay_naistera_model_row"><label>Модель Naistera</label><select id="slay_naistera_model" class="flex1"><option value="grok" ${normalizeNaisteraModel(settings.naisteraModel) === 'grok' ? 'selected' : ''}>Grok</option><option value="nano banana" ${normalizeNaisteraModel(settings.naisteraModel) === 'nano banana' ? 'selected' : ''}>Nano Banana</option></select></div>
                    <div class="flex-row ${settings.apiType === 'naistera' ? '' : 'iig-hidden'}" id="slay_naistera_aspect_row"><label>Соотношение</label><select id="slay_naistera_aspect_ratio" class="flex1"><option value="1:1" ${settings.naisteraAspectRatio === '1:1' ? 'selected' : ''}>1:1</option><option value="3:2" ${settings.naisteraAspectRatio === '3:2' ? 'selected' : ''}>3:2</option><option value="2:3" ${settings.naisteraAspectRatio === '2:3' ? 'selected' : ''}>2:3</option></select></div>
                    <div class="flex-row ${settings.apiType === 'naistera' ? '' : 'iig-hidden'}" id="slay_naistera_preset_row"><label>Пресет</label><select id="slay_naistera_preset" class="flex1"><option value="" ${!settings.naisteraPreset ? 'selected' : ''}>Нет</option><option value="digital" ${settings.naisteraPreset === 'digital' ? 'selected' : ''}>Digital</option><option value="realism" ${settings.naisteraPreset === 'realism' ? 'selected' : ''}>Realism</option></select></div>
                </div>

                <!-- NPC refs -->
                <div id="slay_refs_section" class="iig-refs ${settings.apiType === 'openai' ? 'iig-hidden' : ''}">
                    <h4><i class="fa-solid fa-user-group"></i> Референсы персонажей</h4>
                    <p class="hint">Загрузите фото для консистентной генерации. Макс 5 на запрос. Char и User отправляются всегда; NPC — если имя в промпте.</p>
                    <div class="iig-refs-grid">
                        <div class="iig-refs-row iig-refs-main">
                            <div class="iig-ref-slot" data-ref-type="char"><div class="iig-ref-thumb-wrap"><img src="" alt="Char" class="iig-ref-thumb"><div class="iig-ref-empty-icon"><i class="fa-solid fa-user"></i></div><label class="iig-ref-upload-overlay" title="Upload"><i class="fa-solid fa-camera"></i><input type="file" accept="image/*" class="iig-ref-file-input" style="display:none"></label></div><div class="iig-ref-info"><div class="iig-ref-label">{{char}}</div><input type="text" class="text_pole iig-ref-name" placeholder="Имя" value=""></div><div class="iig-ref-actions"><label class="menu_button iig-ref-upload-btn" title="Upload"><i class="fa-solid fa-upload"></i><input type="file" accept="image/*" class="iig-ref-file-input" style="display:none"></label><div class="menu_button iig-ref-delete-btn" title="Удалить"><i class="fa-solid fa-trash-can"></i></div></div></div>
                            <div class="iig-ref-slot" data-ref-type="user"><div class="iig-ref-thumb-wrap"><img src="" alt="User" class="iig-ref-thumb"><div class="iig-ref-empty-icon"><i class="fa-solid fa-user"></i></div><label class="iig-ref-upload-overlay" title="Upload"><i class="fa-solid fa-camera"></i><input type="file" accept="image/*" class="iig-ref-file-input" style="display:none"></label></div><div class="iig-ref-info"><div class="iig-ref-label">{{user}}</div><input type="text" class="text_pole iig-ref-name" placeholder="Имя" value=""></div><div class="iig-ref-actions"><label class="menu_button iig-ref-upload-btn" title="Upload"><i class="fa-solid fa-upload"></i><input type="file" accept="image/*" class="iig-ref-file-input" style="display:none"></label><div class="menu_button iig-ref-delete-btn" title="Удалить"><i class="fa-solid fa-trash-can"></i></div></div></div>
                        </div>
                        <div class="iig-refs-divider"><span>NPCs</span></div>
                        <div class="iig-refs-row iig-refs-npcs">${npcSlotsHtml}</div>
                    </div>
                </div>

                <!-- Wardrobe -->
                <div class="iig-section">
                    <h4><i class="fa-solid fa-shirt"></i> Гардероб</h4>
                    <p class="hint">Загрузите аутфиты для бота и юзера. Активный аутфит отправляется как reference + описание в промпт.</p>
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
                            <div class="flex-row" style="margin-top:6px;"><label>Модель</label><select id="slay_sw_describe_model" class="flex1">${swSettings.describeModel ? `<option value="${sanitizeForHtml(swSettings.describeModel)}" selected>${sanitizeForHtml(swSettings.describeModel)}</option>` : '<option value="gemini-2.0-flash" selected>gemini-2.0-flash</option>'}</select><div id="slay_sw_describe_refresh" class="menu_button iig-refresh-btn" title="Обновить"><i class="fa-solid fa-sync"></i></div></div>
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
                </div>

                <!-- Image context -->
                <div id="slay_image_context_section" class="iig-section ${(settings.apiType === 'gemini' || settings.apiType === 'naistera') ? '' : 'iig-hidden'}">
                    <h4><i class="fa-solid fa-layer-group"></i> Контекст изображений</h4>
                    <label class="checkbox_label"><input type="checkbox" id="slay_image_context_enabled" ${settings.imageContextEnabled ? 'checked' : ''}><span>Отправлять предыдущие картинки как reference</span></label>
                    <div class="flex-row ${settings.imageContextEnabled ? '' : 'iig-hidden'}" id="slay_image_context_count_row"><label>Кол-во (макс ${MAX_CONTEXT_IMAGES})</label><input type="number" id="slay_image_context_count" class="text_pole flex1" value="${settings.imageContextCount}" min="1" max="${MAX_CONTEXT_IMAGES}"></div>
                </div>

                <!-- Avatar refs removed — char/user refs + wardrobe cover this -->

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

                <div id="slay_manual_save" class="menu_button" style="width:100%;text-align:center;margin-bottom:6px;background:#2a6a2a;"><i class="fa-solid fa-floppy-disk"></i> Сохранить настройки</div>
                <p id="slay_save_status" class="hint" style="text-align:center;font-size:0.85em;min-height:1.2em;"></p>
                <p class="hint" style="text-align:center;opacity:0.5;margin-top:4px;">v4.0.0 by <a href="https://github.com/aceeenvw/notsosillynotsoimages" target="_blank" style="color:inherit;text-decoration:underline;">aceeenvw</a> + <a href="https://github.com/0xl0cal/sillyimages" target="_blank" style="color:inherit;text-decoration:underline;">0xl0cal</a> + Wewwa</p>
                <p id="slay_session_stats" class="hint" style="text-align:center;opacity:0.35;margin-top:2px;font-size:0.8em;"></p>
            </div>
        </div>
    </div>`;

    container.insertAdjacentHTML('beforeend', html);
    bindSettingsEvents();
    bindRefSlotEvents();
    renderRefSlots();
}

function bindRefSlotEvents() {
    for (const slot of document.querySelectorAll('.iig-ref-slot')) {
        const refType = slot.dataset.refType;
        const npcIndex = parseInt(slot.dataset.npcIndex, 10);
        slot.querySelector('.iig-ref-name')?.addEventListener('input', (e) => {
            const s = getCurrentCharacterRefs();
            if (refType === 'char') s.charRef.name = e.target.value;
            else if (refType === 'user') s.userRef.name = e.target.value;
            else if (refType === 'npc') { if (!s.npcReferences[npcIndex]) s.npcReferences[npcIndex] = { name: '', imageBase64: '' }; s.npcReferences[npcIndex].name = e.target.value; }
            saveSettings();
        });
        const fileHandler = async (e) => {
            const file = e.target.files?.[0]; if (!file) return;
            try {
                const rawBase64 = await new Promise((res, rej) => { const r = new FileReader(); r.onloadend = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });
                const compressed = await compressBase64Image(rawBase64, 768, 0.8);
                const label = refType === 'npc' ? `npc${npcIndex}` : refType;
                const savedPath = await saveRefImageToFile(compressed, label);
                const s = getCurrentCharacterRefs();
                if (refType === 'char') { s.charRef.imageBase64 = ''; s.charRef.imagePath = savedPath; }
                else if (refType === 'user') { s.userRef.imageBase64 = ''; s.userRef.imagePath = savedPath; }
                else if (refType === 'npc') { if (!s.npcReferences[npcIndex]) s.npcReferences[npcIndex] = { name: '', imageBase64: '', imagePath: '' }; s.npcReferences[npcIndex].imageBase64 = ''; s.npcReferences[npcIndex].imagePath = savedPath; }
                saveSettings();
                const thumb = slot.querySelector('.iig-ref-thumb'); if (thumb) thumb.src = savedPath;
                const tw = slot.querySelector('.iig-ref-thumb-wrap'); if (tw) tw.classList.add('has-image');
                toastr.success('Фото сохранено', 'SLAY Images', { timeOut: 2000 });
            } catch (err) { toastr.error('Ошибка загрузки фото', 'SLAY Images'); }
            e.target.value = '';
        };
        for (const fi of slot.querySelectorAll('.iig-ref-file-input')) fi.addEventListener('change', fileHandler);
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

function bindSettingsEvents() {
    const settings = getSettings();

    const updateVisibility = () => {
        const apiType = settings.apiType;
        const isNaistera = apiType === 'naistera';
        const isGemini = apiType === 'gemini';
        const isOpenAI = apiType === 'openai';
        document.getElementById('slay_model_row')?.classList.toggle('iig-hidden', isNaistera);
        document.getElementById('slay_size_row')?.classList.toggle('iig-hidden', !isOpenAI);
        document.getElementById('slay_quality_row')?.classList.toggle('iig-hidden', !isOpenAI);
        document.getElementById('slay_naistera_model_row')?.classList.toggle('iig-hidden', !isNaistera);
        document.getElementById('slay_naistera_aspect_row')?.classList.toggle('iig-hidden', !isNaistera);
        document.getElementById('slay_naistera_preset_row')?.classList.toggle('iig-hidden', !isNaistera);
        document.getElementById('slay_naistera_hint')?.classList.toggle('iig-hidden', !isNaistera);
        document.getElementById('slay_gemini_params')?.classList.toggle('iig-hidden', !isGemini);
        document.getElementById('slay_refs_section')?.classList.toggle('iig-hidden', isOpenAI);
        document.getElementById('slay_image_context_section')?.classList.toggle('iig-hidden', !(isNaistera || isGemini));
        document.getElementById('slay_image_context_count_row')?.classList.toggle('iig-hidden', !((isNaistera || isGemini) && settings.imageContextEnabled));
        // Avatar ref sections removed
        document.getElementById('slay_naistera_video_section')?.classList.toggle('iig-hidden', !isNaistera);
        document.getElementById('slay_naistera_video_frequency_row')?.classList.toggle('iig-hidden', !(isNaistera && settings.naisteraVideoTest));
        const endpointInput = document.getElementById('slay_endpoint');
        if (endpointInput) endpointInput.placeholder = getEndpointPlaceholder(apiType);
    };

    document.getElementById('slay_enabled')?.addEventListener('change', (e) => { settings.enabled = e.target.checked; saveSettings(); updateHeaderStatusDot(); });
    document.getElementById('slay_external_blocks')?.addEventListener('change', (e) => { settings.externalBlocks = e.target.checked; saveSettings(); });
    document.getElementById('slay_api_type')?.addEventListener('change', (e) => {
        const next = e.target.value;
        const endpointInput = document.getElementById('slay_endpoint');
        if (shouldReplaceEndpointForApiType(next, settings.endpoint)) { settings.endpoint = normalizeConfiguredEndpoint(next, ''); if (endpointInput) endpointInput.value = settings.endpoint; }
        else if (next === 'naistera') { settings.endpoint = normalizeConfiguredEndpoint(next, settings.endpoint); if (endpointInput) endpointInput.value = settings.endpoint; }
        settings.apiType = next; saveSettings(); updateVisibility();
    });
    document.getElementById('slay_endpoint')?.addEventListener('input', (e) => { settings.endpoint = e.target.value; saveSettings(); });
    document.getElementById('slay_api_key')?.addEventListener('input', (e) => { settings.apiKey = e.target.value; saveSettings(); });
    document.getElementById('slay_key_toggle')?.addEventListener('click', () => {
        const input = document.getElementById('slay_api_key'); const icon = document.querySelector('#slay_key_toggle i');
        if (input.type === 'password') { input.type = 'text'; icon.classList.replace('fa-eye', 'fa-eye-slash'); } else { input.type = 'password'; icon.classList.replace('fa-eye-slash', 'fa-eye'); }
    });
    document.getElementById('slay_model')?.addEventListener('change', (e) => { settings.model = e.target.value; saveSettings(); if (isGeminiModel(e.target.value)) { document.getElementById('slay_api_type').value = 'gemini'; settings.apiType = 'gemini'; updateVisibility(); } });
    document.getElementById('slay_refresh_models')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget; btn.classList.add('loading');
        try { const models = await fetchModels(); const sel = document.getElementById('slay_model'); sel.innerHTML = '<option value="">-- Выберите --</option>'; for (const m of models) { const o = document.createElement('option'); o.value = m; o.textContent = m; o.selected = m === settings.model; sel.appendChild(o); } toastr.success(`Моделей: ${models.length}`, 'SLAY Images'); }
        catch(e) { toastr.error('Ошибка загрузки', 'SLAY Images'); } finally { btn.classList.remove('loading'); }
    });
    document.getElementById('slay_size')?.addEventListener('change', (e) => { settings.size = e.target.value; saveSettings(); });
    document.getElementById('slay_quality')?.addEventListener('change', (e) => { settings.quality = e.target.value; saveSettings(); });
    document.getElementById('slay_aspect_ratio')?.addEventListener('change', (e) => { settings.aspectRatio = e.target.value; saveSettings(); });
    document.getElementById('slay_image_size')?.addEventListener('change', (e) => { settings.imageSize = e.target.value; saveSettings(); });
    document.getElementById('slay_naistera_model')?.addEventListener('change', (e) => { settings.naisteraModel = normalizeNaisteraModel(e.target.value); saveSettings(); });
    document.getElementById('slay_naistera_aspect_ratio')?.addEventListener('change', (e) => { settings.naisteraAspectRatio = e.target.value; saveSettings(); });
    document.getElementById('slay_naistera_preset')?.addEventListener('change', (e) => { settings.naisteraPreset = e.target.value; saveSettings(); });
    document.getElementById('slay_image_context_enabled')?.addEventListener('change', (e) => { settings.imageContextEnabled = e.target.checked; saveSettings(); updateVisibility(); });
    document.getElementById('slay_image_context_count')?.addEventListener('input', (e) => { settings.imageContextCount = normalizeImageContextCount(e.target.value); e.target.value = String(settings.imageContextCount); saveSettings(); });
    // Avatar ref handlers removed — char/user refs + wardrobe cover this
    document.getElementById('slay_naistera_video_test')?.addEventListener('change', (e) => { settings.naisteraVideoTest = e.target.checked; saveSettings(); updateVisibility(); });
    document.getElementById('slay_naistera_video_every_n')?.addEventListener('input', (e) => { settings.naisteraVideoEveryN = normalizeNaisteraVideoFrequency(e.target.value); e.target.value = String(settings.naisteraVideoEveryN); saveSettings(); });
    document.getElementById('slay_max_retries')?.addEventListener('input', (e) => { const v = parseInt(e.target.value, 10); settings.maxRetries = Number.isNaN(v) ? 0 : Math.max(0, Math.min(5, v)); saveSettings(); });
    document.getElementById('slay_retry_delay')?.addEventListener('input', (e) => { const v = parseInt(e.target.value, 10); settings.retryDelay = Number.isNaN(v) ? 1000 : Math.max(500, v); saveSettings(); });
    document.getElementById('slay_export_logs')?.addEventListener('click', exportLogs);

    // Manual save
    document.getElementById('slay_manual_save')?.addEventListener('click', async () => {
        const btn = document.getElementById('slay_manual_save'); const status = document.getElementById('slay_save_status');
        btn.style.opacity = '0.6'; status.textContent = 'Сохраняю...';
        let ok = false; const errors = [];
        if (typeof window.saveSettings === 'function') { try { await window.saveSettings(); ok = true; } catch(e) { errors.push(e.message); } }
        try { SillyTavern.getContext().saveSettingsDebounced(); } catch(e) {}
        persistRefsToLocalStorage();
        if (!ok) { try { const ctx = SillyTavern.getContext(); const payload = { extension_settings: ctx.extensionSettings }; const resp = await fetch('/api/settings/save', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify(payload) }); if (resp.ok) ok = true; else errors.push('HTTP ' + resp.status); } catch(e) { errors.push(e.message); } }
        btn.style.opacity = '1';
        if (ok) { status.style.color = '#4caf50'; status.textContent = '✓ Сохранено!'; setTimeout(() => { status.textContent = ''; }, 3000); }
        else { status.style.color = '#f44336'; status.textContent = '✗ ' + errors.join('; '); }
    });

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
        if (s) { s.describeKey = e.target.value; SillyTavern.getContext().saveSettingsDebounced(); }
    });
    document.getElementById('slay_sw_describe_key_toggle')?.addEventListener('click', () => {
        const input = document.getElementById('slay_sw_describe_key'); const icon = document.querySelector('#slay_sw_describe_key_toggle i');
        if (input.type === 'password') { input.type = 'text'; icon.classList.replace('fa-eye', 'fa-eye-slash'); } else { input.type = 'password'; icon.classList.replace('fa-eye-slash', 'fa-eye'); }
    });
    document.getElementById('slay_sw_describe_model')?.addEventListener('change', (e) => {
        const s = SillyTavern.getContext().extensionSettings.slay_wardrobe;
        if (s) { s.describeModel = e.target.value; SillyTavern.getContext().saveSettingsDebounced(); }
    });
    document.getElementById('slay_sw_describe_refresh')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget; btn.classList.add('loading');
        try {
            const swS = SillyTavern.getContext().extensionSettings.slay_wardrobe || {};
            const iigS = SillyTavern.getContext().extensionSettings[MODULE_NAME] || {};
            const ep = (swS.describeEndpoint || iigS.endpoint || '').replace(/\/$/, '');
            const key = swS.describeKey || iigS.apiKey || '';
            if (!ep || !key) throw new Error('Укажите endpoint и API key');
            const url = `${ep}/v1/models`;
            const resp = await fetch(url, { method: 'GET', headers: { 'Authorization': `Bearer ${key}` } });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const models = (data.data || []).map(m => m.id).sort();
            const sel = document.getElementById('slay_sw_describe_model');
            const current = swS.describeModel || 'gemini-2.0-flash';
            sel.innerHTML = '';
            for (const m of models) { const o = document.createElement('option'); o.value = m; o.textContent = m; o.selected = m === current; sel.appendChild(o); }
            if (models.length === 0) sel.innerHTML = '<option value="gemini-2.0-flash">gemini-2.0-flash</option>';
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
            const ep = (swS.describeEndpoint || iigS.endpoint || '').replace(/\/$/, '');
            const key = swS.describeKey || iigS.apiKey || '';
            if (!ep || !key) throw new Error('Укажите endpoint и API key');
            const url = `${ep}/v1/models`;
            const resp = await fetch(url, { method: 'GET', headers: { 'Authorization': `Bearer ${key}` } });
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

    updateVisibility();
}

// ── Lightbox ──
function initLightbox() {
    if (document.getElementById('slay_lightbox')) return;
    const overlay = document.createElement('div'); overlay.id = 'slay_lightbox'; overlay.className = 'iig-lightbox';
    overlay.innerHTML = `<div class="iig-lightbox-backdrop"></div><div class="iig-lightbox-content"><img class="iig-lightbox-img" src="" alt=""><div class="iig-lightbox-caption"></div><button class="iig-lightbox-close" title="Close"><i class="fa-solid fa-xmark"></i></button></div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.classList.remove('open');
    overlay.querySelector('.iig-lightbox-backdrop').addEventListener('click', close);
    overlay.querySelector('.iig-lightbox-close').addEventListener('click', close);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay.classList.contains('open')) close(); });
    document.getElementById('chat')?.addEventListener('click', (e) => {
        const img = e.target.closest('.iig-generated-image'); if (!img) return;
        e.preventDefault(); e.stopPropagation();
        overlay.querySelector('.iig-lightbox-img').src = img.src;
        overlay.querySelector('.iig-lightbox-caption').textContent = img.alt || '';
        overlay.classList.add('open');
    });
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
    iigLog('INFO', 'Initializing Slay Images v4.0.0');

    // Settings migration
    if (context.extensionSettings.silly_wardrobe && !context.extensionSettings.slay_wardrobe) {
        context.extensionSettings.slay_wardrobe = structuredClone(context.extensionSettings.silly_wardrobe);
        iigLog('INFO', 'Migrated silly_wardrobe -> slay_wardrobe');
    }
    if (context.extensionSettings.inline_image_gen && !context.extensionSettings.slay_image_gen) {
        context.extensionSettings.slay_image_gen = structuredClone(context.extensionSettings.inline_image_gen);
        // Force disable avatar sending — SLAY uses ref slots, not ST avatars
        context.extensionSettings.slay_image_gen.sendCharAvatar = false;
        context.extensionSettings.slay_image_gen.sendUserAvatar = false;
        context.extensionSettings.slay_image_gen.naisteraSendCharAvatar = false;
        context.extensionSettings.slay_image_gen.naisteraSendUserAvatar = false;
        iigLog('INFO', 'Migrated inline_image_gen -> slay_image_gen (avatar sending disabled)');
    }

    getSettings();

    context.eventSource.on(context.event_types.APP_READY, () => {
        restoreRefsFromLocalStorage();
        createSettingsUI();
        addButtonsToExistingMessages();
        initLightbox();
        updateHeaderStatusDot();
        initMobileSaveListeners();
        iigLog('INFO', 'Slay Images extension loaded');
    });

    context.eventSource.on(context.event_types.CHAT_CHANGED, () => {
        setTimeout(() => {
            restoreRefsFromLocalStorage();
            addButtonsToExistingMessages();
            renderRefSlots();
        }, 300);
    });

    context.eventSource.makeLast(context.event_types.CHARACTER_MESSAGE_RENDERED, async (messageId) => {
        await onMessageReceived(messageId);
    });

    iigLog('INFO', 'Slay Images initialized');
})();
