/**
 * 💅🔥 SLAY Images — Inline Image Generation + Wardrobe + Gallery
 * by Wewwa (https://github.com/wewwaistyping) — tg: @wewwajai
 * gallery update by hydall (https://github.com/hydall)
 * based on sillyimages by 0xl0cal and aceeenvw's NPC system
 */
const SLAY_VERSION = '4.2.8';

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

    const GENDERS = Object.freeze({ unisex: '⚥', female: '♀️', male: '♂️' });
    const GENDER_KEYS = Object.keys(GENDERS);
    const GENDER_COLORS = Object.freeze({ unisex: '#a855f7', female: '#f472b6', male: '#60a5fa' });

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
        // v4.1 UX additions
        modalWidth: 'normal',   // compact | normal | wide | xwide | full
        showHidden: false,      // toggle to show hidden items in grid
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
        let h = '<div class="sw-outfit-grid"><div class="sw-outfit-card sw-upload-card" id="sw-upload-trigger"><div class="sw-upload-icon"><i class="fa-solid fa-plus"></i></div><span>Загрузить</span></div>';
        for (const o of filtered) {
            const a = o.id === equippedId;
            const fav = !!o.favourite;
            const hid = !!o.hidden;
            const classes = ['sw-outfit-card'];
            if (a) classes.push('sw-outfit-active');
            if (fav) classes.push('sw-outfit-favourite');
            if (hid) classes.push('sw-outfit-hidden');
            h += `<div class="${classes.join(' ')}" data-id="${o.id}">
                <div class="sw-outfit-img-wrap">
                    <img src="${swGetOutfitSrc(o)}" alt="${esc(o.name)}" class="sw-outfit-img" loading="lazy">
                    ${a ? '<div class="sw-active-badge"><i class="fa-solid fa-check"></i></div>' : ''}
                    <button class="sw-corner-btn sw-corner-fav ${fav ? 'sw-corner-active' : ''}" data-act="fav" title="${fav ? 'Убрать из избранного' : 'В избранное'}"><i class="fa-${fav ? 'solid' : 'regular'} fa-star"></i></button>
                    <button class="sw-corner-btn sw-corner-hide ${hid ? 'sw-corner-active' : ''}" data-act="hide" title="${hid ? 'Показать' : 'Скрыть'}"><i class="fa-solid fa-eye${hid ? '-slash' : ''}"></i></button>
                    <div style="position:absolute;top:4px;left:4px;font-size:10px;padding:1px 5px;border-radius:6px;background:rgba(0,0,0,0.5);color:${GENDER_COLORS[o.gender || 'unisex']};">${GENDERS[o.gender || 'unisex']}</div>
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

        // Update header hidden count
        const hdrToggle = document.getElementById('sw-show-hidden-toggle');
        if (hdrToggle) {
            const hiddenCount = allItems.filter(o => o.hidden).length;
            const labelText = hdrToggle.childNodes[hdrToggle.childNodes.length - 1];
            if (labelText && labelText.nodeType === 3) labelText.textContent = ` Скрытые: ${hiddenCount}`;
        }

        document.getElementById('sw-upload-trigger')?.addEventListener('click', swUpload);
        for (const card of content.querySelectorAll('.sw-outfit-card[data-id]')) {
            const id = card.dataset.id;
            card.querySelector('.sw-outfit-img')?.addEventListener('click', (e) => { e.preventDefault(); e.stopImmediatePropagation(); swToggle(id); });
            card.querySelector('.sw-btn-activate')?.addEventListener('click', (e) => { e.preventDefault(); e.stopImmediatePropagation(); swToggle(id); });
            card.querySelector('.sw-corner-fav')?.addEventListener('click', (e) => { e.preventDefault(); e.stopImmediatePropagation(); swToggleFavourite(id); swRender(); });
            card.querySelector('.sw-corner-hide')?.addEventListener('click', (e) => { e.preventDefault(); e.stopImmediatePropagation(); swToggleHidden(id); swRender(); });
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
                </div>`);
            if (!el) { resolve(null); return; }
            for (const btn of el.querySelectorAll('.sw-inline-btn')) {
                btn.addEventListener('click', () => { swRestoreInline(); resolve(btn.dataset.choice); });
            }
        });
    }

    // ── Upload modal (custom, replaces browser prompts) ──
    // Render sub-forms inside #sw-tab-content, replacing the grid temporarily
    let _savedContent = null;
    function swShowInline(html) {
        const el = document.getElementById('sw-tab-content');
        if (!el) return null;
        _savedContent = el.innerHTML;
        el.innerHTML = html;
        // Hide current outfit preview and filters while sub-form is open
        const cur = document.getElementById('sw-current-outfit'); if (cur) cur.style.display = 'none';
        return el;
    }
    function swRestoreInline() {
        const el = document.getElementById('sw-tab-content');
        if (el && _savedContent !== null) { el.innerHTML = _savedContent; _savedContent = null; }
        const cur = document.getElementById('sw-current-outfit'); if (cur) cur.style.display = '';
        swRender(); // re-render to rebind events
    }

    function swShowUploadModal(defaultName) {
        return new Promise((resolve) => {
            let tagsHtml = '';
            for (const tag of TAG_KEYS) { tagsHtml += `<label style="display:inline-flex;align-items:center;gap:3px;font-size:12px;color:#bbb;cursor:pointer;"><input type="checkbox" value="${tag}" style="accent-color:#db7093;"> ${esc(TAGS[tag])}</label> `; }
            let catOptions = '';
            for (const cat of CAT_KEYS) { catOptions += `<option value="${cat}" ${cat === swCatTab ? 'selected' : ''}>${esc(CATEGORIES[cat])}</option>`; }

            const el = swShowInline(`
                <div style="padding:10px;">
                    <h3 style="margin:0 0 12px;font-size:15px;color:#f472b6;">👗 Новый предмет</h3>
                    <label style="display:block;font-size:12px;color:#aaa;margin:8px 0 4px;">Название</label>
                    <input type="text" id="sw-upl-name" value="${esc(defaultName)}" placeholder="Название" style="width:100%;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.2);color:#eee;font-size:13px;box-sizing:border-box;">
                    <label style="display:block;font-size:12px;color:#aaa;margin:8px 0 4px;">Категория</label>
                    <select id="sw-upl-cat" style="width:100%;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.2);color:#eee;font-size:13px;box-sizing:border-box;">${catOptions}</select>
                    <label style="display:block;font-size:12px;color:#aaa;margin:8px 0 4px;">Для кого</label>
                    <select id="sw-upl-forwho" style="width:100%;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.2);color:#eee;font-size:13px;box-sizing:border-box;"><option value="all">Все</option><option value="bot" ${swTab === 'bot' ? 'selected' : ''}>Бот</option><option value="user" ${swTab === 'user' ? 'selected' : ''}>Юзер</option></select>
                    <label style="display:block;font-size:12px;color:#aaa;margin:8px 0 4px;">Пол</label>
                    <select id="sw-upl-gender" style="width:100%;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.2);color:#eee;font-size:13px;box-sizing:border-box;"><option value="unisex">⚥ Унисекс</option><option value="female">♀️ Женское</option><option value="male">♂️ Мужское</option></select>
                    <label style="display:block;font-size:12px;color:#aaa;margin:8px 0 4px;">Теги</label>
                    <div id="sw-upl-tags" style="display:flex;flex-wrap:wrap;gap:6px;">${tagsHtml}</div>
                    <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end;">
                        <button id="sw-upl-cancel" style="padding:8px 18px;border-radius:10px;border:none;cursor:pointer;font-size:13px;background:rgba(255,255,255,0.08);color:#aaa;">Отмена</button>
                        <button id="sw-upl-save" style="padding:8px 18px;border-radius:10px;border:none;cursor:pointer;font-size:13px;background:rgba(219,112,147,0.3);color:#f0a0c0;">Сохранить</button>
                    </div>
                </div>`);
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
                </div>`);
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
                </div>`);
            if (!el) { resolve(null); return; }
            const close = (val) => { swRestoreInline(); resolve(val); };
            el.querySelector('#sw-edit-cancel').addEventListener('click', () => close(null));
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
        const maxTokens = (category === 'hair') ? 80 : 300;
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
                        contents: [{
                            role: 'user', parts: [
                                { inlineData: { mimeType: 'image/png', data: base64 } },
                                { text: describePrompt }
                            ]
                        }],
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
                            {
                                role: 'user', content: [
                                    { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } },
                                    { type: 'text', text: 'Describe the clothing in this image.' }
                                ]
                            }
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
                    gender: result.gender || 'unisex',
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
            $btn.on('click touchend', function (e) { e.preventDefault(); e.stopPropagation(); swOpenModal(); });
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
    // intermittent "wardrobe description missing" cases:
    //   - User sends message within the 300ms CHAT_CHANGED debounce window
    //   - Swipe / regenerate cleared/reordered ST's extension prompt buffer
    //   - User's preset rebuilds the messages array and stale ext prompts
    // Calling swUpdatePromptInjection() here guarantees the injection is
    // present and current for every single generation.
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

// PREVIEW BUILD — isolated. Seeded once from slay_image_gen on first load.
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

function persistRefsToLocalStorage() {
    try {
        const settings = getSettings();
        const refs = JSON.parse(JSON.stringify(settings.npcReferences || {}));
        localStorage.setItem(LS_KEY, JSON.stringify(refs));
    } catch (e) { iigLog('WARN', 'persistRefsToLocalStorage failed:', e.message); }
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
    } catch (e) { iigLog('WARN', 'restoreRefsFromLocalStorage failed:', e.message); }
}

function initMobileSaveListeners() {
    const flush = () => {
        persistRefsToLocalStorage();
        try { SillyTavern.getContext().saveSettingsDebounced(); } catch (e) { }
        if (typeof _stSaveSettings === 'function' && _stSaveSettings !== saveSettings) { try { _stSaveSettings(); } catch (e) { } }
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

function nameIsInPrompt(rawName, lowerPrompt) {
    const tokens = parseNameTokens(rawName);
    if (tokens.length === 0) return false;
    return tokens.some(t => lowerPrompt.includes(t.toLowerCase()));
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

// Compute BOTH hashes — byte (exact) and pixel (visual). Returns { byteHash, pixelHash }.
async function computeRefHashes(rawBase64) {
    const [byteHash, pixelHash] = await Promise.all([
        sha256OfBase64(rawBase64),
        pixelHashOfBase64(rawBase64),
    ]);
    return { byteHash, pixelHash };
}

// Quick HEAD probe to check if a previously-saved path still exists on disk.
// If the user deleted it from /user/images manually, we shouldn't return a stale path.
async function refFileStillExists(path) {
    try { const r = await fetch(path, { method: 'HEAD' }); return r.ok; } catch (_) { return false; }
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
        try { SillyTavern.getContext()?.saveSettings?.(); } catch (_) {}
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
    try { SillyTavern.getContext()?.saveSettings?.(); } catch (_) {}
    iigLog('INFO', `Recording ref hashes (b:${hashes.byteHash?.slice(0,8)} p:${hashes.pixelHash?.slice(0,8)}) -> ${path} (map ${Object.keys(settings.refHashMap).length})`);
}

// Legacy single-hash lookup — still used elsewhere, thin wrapper for compat.
async function lookupRefByHash(hash) { return lookupRefByHashes({ byteHash: hash }); }

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
    // Caller is responsible for recording hash(es) via recordRefHashes — it has access to
    // both byte- and pixel-hash of the RAW base64 (pre-compression) which is more reliable.
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
    const endpoint = settings.endpoint.replace(/\/$/, '');
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

    const content = [{ type: 'text', text: fullPrompt }, ...imageParts];
    const body = {
        model,
        messages: [{ role: 'user', content }],
        modalities: ['image', 'text'],
        stream: false,
    };

    const url = `${endpoint}/v1/chat/completions`;
    iigLog('INFO', `OpenAI chat.completions: model=${model}, ratio=${aspectRatio}, size=${imageSize}, refs=${imgCount}`);
    const response = await robustFetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
    const url = `${settings.endpoint.replace(/\/$/, '')}/v1beta/models/${model}:generateContent`;
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
        response = await robustFetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
    if (Array.isArray(message.swipes) && Number.isInteger(message.swipe_id) && typeof message.swipes[message.swipe_id] === 'string') {
        message.swipes[message.swipe_id] = rep(message.swipes[message.swipe_id]);
    }
    if (Array.isArray(message.swipe_info) && Number.isInteger(message.swipe_id) && message.swipe_info[message.swipe_id]) {
        const si = message.swipe_info[message.swipe_id];
        if (si.extra) {
            if (typeof si.extra.display_text === 'string') si.extra.display_text = rep(si.extra.display_text);
            if (typeof si.extra.extblocks === 'string') si.extra.extblocks = rep(si.extra.extblocks);
        }
    }
    return changed;
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
                if (message && origSrcAttr) {
                    const replaced = replaceImageSrcEverywhere(message, origSrcAttr, newImagePath);
                    if (replaced) {
                        // FORCE-save (not debounced). Without this, if the user
                        // reloaded or switched chat within ~5s of the regen,
                        // message.mes still held the OLD src and the previous
                        // image (or error placeholder) silently re-appeared on
                        // next render. The new image stayed on disk in the
                        // gallery but vanished from the chat. Same fix we did
                        // for retryFailedGeneration in 4.1.6.
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
function attachRegenButtonsInRoot(root) {
    if (!root) return;

    // FIRST: rehydrate any stale error-img remnants. They may be <img src="error.svg">
    // OR the same img wrapped into a <span class="iig-img-wrap"> (if some earlier pass
    // gave them a regen overlay from an older version). Also catch broken-img fallbacks
    // (src like /error.svg that 404'd).
    const errorSelectors = [
        'img.iig-error-image[data-iig-instruction]',
        'img[data-iig-instruction][src*="error.svg"]',
        'img[data-iig-instruction][src*="[IMG:ERROR"]',
    ].join(', ');
    for (const stale of root.querySelectorAll(errorSelectors)) {
        const instr = stale.getAttribute('data-iig-instruction') || '';
        const errorEl = createErrorPlaceholder(stale.dataset.tagId || `iig-reload-${Date.now()}`, 'Картинка не была сгенерирована', { fullMatch: `data-iig-instruction='${instr}'` });
        // If the stale img is inside an iig-img-wrap (regen overlay from older build),
        // replace the WHOLE wrap, not just the img — otherwise the overlay circle stays visible.
        const wrap = stale.closest('.iig-img-wrap');
        (wrap || stale).replaceWith(errorEl);
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

// ╔═════════════════════════════════════════════════════════════╗
// ║  generateImageWithRetry — THE CRITICAL MERGE POINT          ║
// ╚═════════════════════════════════════════════════════════════╝

async function generateImageWithRetry(prompt, style, onStatusUpdate, options = {}) {
    validateSettings();
    const settings = getSettings();
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
    if (settings.apiType !== 'naistera') {
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
                // models behind /v1/chat/completions, NOT /v1beta. If we override
                // by model name, we'd 404 on those routers despite the user
                // explicitly picking OpenAI-compatible.
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

async function checkFileExists(path) { try { const r = await fetch(path, { method: 'HEAD' }); return r.ok; } catch (e) { return false; } }

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
            try { const resp = await fetch(path, { method: 'HEAD' }); if (resp.ok) { _cachedErrorImagePath = path; return; } } catch (e) { }
        }
    })();
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

        // Persist new src in message source so it survives reload
        if (message && typeof message.mes === 'string') {
            const errorImgPath = getErrorImagePath();
            const updated = String(message.mes).replace(errorImgPath, imagePath);
            if (updated !== message.mes) {
                message.mes = updated;
                if (message.extra?.display_text) message.extra.display_text = String(message.extra.display_text).replace(errorImgPath, imagePath);
                if (message.extra?.extblocks) message.extra.extblocks = String(message.extra.extblocks).replace(errorImgPath, imagePath);
                // IMPORTANT: use force-save (not debounced). If user leaves chat quickly
                // after a successful retry, debounced save may never fire and the old
                // error.svg src persists in the chat file, causing the error placeholder
                // to re-render on return.
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
                const labelEl = loadingPlaceholder.querySelector('.iig-status-label') || statusEl;
                const timerEl = loadingPlaceholder.querySelector('.iig-status-timer');
                const result = await generateImageWithRetry(tag.prompt, tag.style, (s) => { labelEl.textContent = s; }, { aspectRatio: tag.aspectRatio, imageSize: tag.imageSize, quality: tag.quality, preset: tag.preset, messageId });
                labelEl.textContent = 'Сохранение...';
                if (timerEl) timerEl.textContent = '';

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
    // Don't clobber a name input that the user is currently typing in. If the
    // input has focus, leave its .value alone; on blur the saved value is
    // already what's there. This prevents cursor jumps from SETTINGS_UPDATED
    // re-renders that fire while typing.
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

// Debounced re-render trigger for high-frequency events (SETTINGS_UPDATED
// fires on every save). 200ms is short enough that persona-switch UI feels
// snappy, long enough that bursts collapse to one render.
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
            <div class="iig-ref-actions"><div class="menu_button iig-ref-upload-btn" title="Upload"><i class="fa-solid fa-upload"></i></div><div class="menu_button iig-ref-delete-btn" title="Удалить"><i class="fa-solid fa-trash-can"></i></div></div>
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
                <div id="slay_settings_body" class="${settings.enabled ? '' : 'iig-hidden'}">
                    <label class="checkbox_label"><input type="checkbox" id="slay_external_blocks" ${settings.externalBlocks ? 'checked' : ''}><span>External blocks (extblocks)</span></label>
                    <hr>

                    <!-- API -->
                <div class="iig-section">
                    <h4><i class="fa-solid fa-plug"></i> API</h4>
                    <div class="flex-row"><label>Тип API</label><select id="slay_api_type" class="flex1"><option value="openai" ${settings.apiType === 'openai' ? 'selected' : ''}>OpenAI-compatible</option><option value="gemini" ${settings.apiType === 'gemini' ? 'selected' : ''}>Gemini-compatible</option><option value="naistera" ${settings.apiType === 'naistera' ? 'selected' : ''}>Naistera</option></select></div>
                    <div class="flex-row"><label>Endpoint</label><input type="text" id="slay_endpoint" class="text_pole flex1" value="${sanitizeForHtml(settings.endpoint)}" placeholder="${getEndpointPlaceholder(settings.apiType)}"></div>
                    <div class="flex-row"><label>API Key</label><input type="password" id="slay_api_key" class="text_pole flex1" value="${sanitizeForHtml(settings.apiKey)}"><div id="slay_key_toggle" class="menu_button iig-key-toggle" title="Show/Hide"><i class="fa-solid fa-eye"></i></div></div>
                    <p id="slay_naistera_hint" class="hint ${settings.apiType === 'naistera' ? '' : 'iig-hidden'}">Naistera: вставьте токен из Telegram-бота.</p>
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
                        <div class="flex-row"><label>Соотношение сторон</label><select id="slay_aspect_ratio" class="flex1"><option value="auto" ${(settings.aspectRatio || 'auto') === 'auto' ? 'selected' : ''}>Из промпта</option><option value="1:1" ${settings.aspectRatio === '1:1' ? 'selected' : ''}>1:1</option><option value="2:3" ${settings.aspectRatio === '2:3' ? 'selected' : ''}>2:3</option><option value="3:2" ${settings.aspectRatio === '3:2' ? 'selected' : ''}>3:2</option><option value="3:4" ${settings.aspectRatio === '3:4' ? 'selected' : ''}>3:4</option><option value="4:3" ${settings.aspectRatio === '4:3' ? 'selected' : ''}>4:3</option><option value="4:5" ${settings.aspectRatio === '4:5' ? 'selected' : ''}>4:5</option><option value="5:4" ${settings.aspectRatio === '5:4' ? 'selected' : ''}>5:4</option><option value="9:16" ${settings.aspectRatio === '9:16' ? 'selected' : ''}>9:16</option><option value="16:9" ${settings.aspectRatio === '16:9' ? 'selected' : ''}>16:9</option><option value="21:9" ${settings.aspectRatio === '21:9' ? 'selected' : ''}>21:9</option></select></div>
                        <div class="flex-row"><label>Разрешение</label><select id="slay_image_size" class="flex1"><option value="1K" ${settings.imageSize === '1K' ? 'selected' : ''}>1K</option><option value="2K" ${settings.imageSize === '2K' ? 'selected' : ''}>2K</option><option value="4K" ${settings.imageSize === '4K' ? 'selected' : ''}>4K</option></select></div>
                    </div>
                    <div class="flex-row ${settings.apiType === 'naistera' ? '' : 'iig-hidden'}" id="slay_naistera_model_row"><label>Модель Naistera</label><select id="slay_naistera_model" class="flex1"><option value="grok" ${normalizeNaisteraModel(settings.naisteraModel) === 'grok' ? 'selected' : ''}>Grok</option><option value="nano banana" ${normalizeNaisteraModel(settings.naisteraModel) === 'nano banana' ? 'selected' : ''}>Nano Banana</option><option value="grok-pro" ${normalizeNaisteraModel(settings.naisteraModel) === 'grok-pro' ? 'selected' : ''}>Grok Pro</option><option value="novelai" ${normalizeNaisteraModel(settings.naisteraModel) === 'novelai' ? 'selected' : ''}>NovelAI</option></select></div>
                    <div class="flex-row ${settings.apiType === 'naistera' ? '' : 'iig-hidden'}" id="slay_naistera_aspect_row"><label>Соотношение</label><select id="slay_naistera_aspect_ratio" class="flex1"><option value="auto" ${(settings.naisteraAspectRatio || 'auto') === 'auto' ? 'selected' : ''}>Из промпта</option><option value="1:1" ${settings.naisteraAspectRatio === '1:1' ? 'selected' : ''}>1:1</option><option value="3:2" ${settings.naisteraAspectRatio === '3:2' ? 'selected' : ''}>3:2</option><option value="2:3" ${settings.naisteraAspectRatio === '2:3' ? 'selected' : ''}>2:3</option></select></div>
                    <div class="flex-row" id="slay_style_row"><label>Стиль</label><div class="flex1" style="display:flex;gap:6px;align-items:center;min-width:0;"><span id="slay_style_name" style="flex:1;min-width:30px;font-size:0.8em;opacity:0.7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${settings.slayStyleName || 'Не заменять'}</span><div id="slay_style_pick_btn" class="menu_button" style="white-space:nowrap;flex-shrink:0;"><i class="fa-solid fa-palette"></i> Выбрать</div></div></div>
                </div>

                <!-- NPC refs -->
                <div id="slay_refs_section" class="iig-refs">
                    <h4><i class="fa-solid fa-user-group"></i> Референсы персонажей</h4>
                    <p class="hint">Рефы (char / user / NPC) и картинки одежды отправляются <b>только</b> когда в промте картинки упомянуто имя. В поле «Имя» можно указать несколько вариантов через запятую (например, <i>Ева, Eve, Eva, Ivy, Иви</i>) — реф подтянется если встретится любой. Чтобы полностью отключить реф для слота — удалите картинку из него.</p>
                    <div class="iig-refs-grid">
                        <div class="iig-refs-row iig-refs-main">
                            <div class="iig-ref-slot" data-ref-type="char"><div class="iig-ref-thumb-wrap"><img src="" alt="Char" class="iig-ref-thumb"><div class="iig-ref-empty-icon"><i class="fa-solid fa-user"></i></div><div class="iig-ref-upload-overlay" title="Upload"><i class="fa-solid fa-camera"></i></div></div><input type="file" accept="image/*" class="iig-ref-file-input" style="display:none"><div class="iig-ref-info"><div class="iig-ref-label">{{char}}</div><input type="text" class="text_pole iig-ref-name" placeholder="Имя (Eva, Ева)" value=""></div><div class="iig-ref-actions"><div class="menu_button iig-ref-upload-btn" title="Upload"><i class="fa-solid fa-upload"></i></div><div class="menu_button iig-ref-delete-btn" title="Удалить"><i class="fa-solid fa-trash-can"></i></div></div></div>
                            <div class="iig-ref-slot" data-ref-type="user"><div class="iig-ref-thumb-wrap"><img src="" alt="User" class="iig-ref-thumb"><div class="iig-ref-empty-icon"><i class="fa-solid fa-user"></i></div><div class="iig-ref-upload-overlay" title="Upload"><i class="fa-solid fa-camera"></i></div></div><input type="file" accept="image/*" class="iig-ref-file-input" style="display:none"><div class="iig-ref-info"><div class="iig-ref-label">{{user}}</div><input type="text" class="text_pole iig-ref-name" placeholder="Имя (Eva, Ева)" value=""></div><div class="iig-ref-actions"><div class="menu_button iig-ref-upload-btn" title="Upload"><i class="fa-solid fa-upload"></i></div><div class="menu_button iig-ref-delete-btn" title="Удалить"><i class="fa-solid fa-trash-can"></i></div></div></div>
                        </div>
                        <div class="iig-refs-divider"><span>NPCs</span></div>
                        <div class="iig-refs-row iig-refs-npcs">${npcSlotsHtml}</div>
                    </div>
                    <!-- v4.2 Recent refs ribbon — populated on render -->
                    <div id="slay_recent_refs_ribbon" class="iig-recent-refs-ribbon"></div>
                </div>
                <!-- v4.2 Floating popup for slot options (Файл / Вставить / Недавние) -->
                <div id="slay_slot_options_popup" class="iig-slot-options-popup"></div>
                <!-- v4.2 Floating popup for "assign recent to slot" -->
                <div id="slay_assign_popup" class="iig-assign-popup"></div>

                <!-- Wardrobe -->
                <div class="iig-section">
                    <h4><i class="fa-solid fa-shirt"></i> Гардероб</h4>
                    <p class="hint" id="slay_wardrobe_hint">Загрузите аутфиты для бота и юзера. Изображение активного аутфита отправится как референс, а словесное описание будет добавлено в промпт.</p>
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
                    <div class="flex-row" style="margin-top:6px;"><label>Размер гардероба (ПК)</label><select id="slay_sw_modal_width" class="flex1">
                        <option value="compact" ${swSettings.modalWidth === 'compact' ? 'selected' : ''}>Компактный (480px)</option>
                        <option value="normal" ${(swSettings.modalWidth || 'normal') === 'normal' ? 'selected' : ''}>Обычный (560px)</option>
                        <option value="wide" ${swSettings.modalWidth === 'wide' ? 'selected' : ''}>Широкий (800px)</option>
                        <option value="xwide" ${swSettings.modalWidth === 'xwide' ? 'selected' : ''}>Очень широкий (1100px)</option>
                        <option value="full" ${swSettings.modalWidth === 'full' ? 'selected' : ''}>Во весь экран</option>
                    </select></div>
                    <p class="hint" style="margin-top:4px;font-size:0.75em;">На мобильных устройствах всегда полноэкранный режим.</p>
                </div>

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
                    · based on sillyimages by <a href="https://github.com/0xl0cal/sillyimages" target="_blank" style="color:inherit;text-decoration:underline;">0xl0cal</a>
                    and <a href="https://github.com/aceeenvw/notsosillynotsoimages" target="_blank" style="color:inherit;text-decoration:underline;">aceeenvw</a>'s NPC system
                </p>
                <p id="slay_session_stats" class="hint" style="text-align:center;opacity:0.35;margin-top:2px;font-size:0.8em;"></p>
            </div>
        </div>
    </div>`;

    container.insertAdjacentHTML('beforeend', html);
    bindSettingsEvents();
    bindRefSlotEvents();
    renderRefSlots();
    renderRecentRefsRibbon();
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
function showAssignPopup(anchor, path) {
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
    const npcSlots = document.querySelectorAll('.iig-ref-slot[data-ref-type="npc"]');
    npcSlots.forEach((slot, i) => {
        const idx = slot.dataset.npcIndex || i;
        slotButtons.push(`<button class="iig-assign-btn" data-key="npc-${idx}">NPC ${Number(idx) + 1}</button>`);
    });
    popup.innerHTML = `
        <button class="iig-popup-close" type="button" title="Закрыть" aria-label="Закрыть"><i class="fa-solid fa-xmark"></i></button>
        <div class="iig-assign-title">Куда применить?</div>
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
            const slot = findSlotByKey(key);
            if (!slot) { closeAllRefPopups(); return; }
            const refType = slot.dataset.refType;
            const npcIndex = parseInt(slot.dataset.npcIndex, 10);
            applyPathToSlot(slot, refType, npcIndex, path);
            pushRecentRef(path);
            slot.classList.add('iig-slot-flash');
            setTimeout(() => slot.classList.remove('iig-slot-flash'), 600);
            closeAllRefPopups();
            toastr.success('Реф применён', 'SLAY Images', { timeOut: 1500 });
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
        const rawBase64 = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onloadend = () => res(String(r.result).split(',')[1]);
            r.onerror = rej;
            r.readAsDataURL(blob);
        });
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
        const compressed = await compressBase64Image(rawBase64, 768, 0.8);
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

function bindRefSlotEvents() {
    for (const slot of document.querySelectorAll('.iig-ref-slot')) {
        const refType = slot.dataset.refType;
        const npcIndex = parseInt(slot.dataset.npcIndex, 10);
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
            // Flush to disk on blur/change/Enter — guarantees name survives even if user closes settings fast.
            const flush = (e) => {
                writeName(e.target.value);
                saveSettings();
                try { SillyTavern.getContext()?.saveSettings?.(); } catch (_) {}
            };
            nameInput.addEventListener('change', flush);
            nameInput.addEventListener('blur', flush);
            nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { flush(e); nameInput.blur(); } });
        }
        const fileHandler = async (e) => {
            const file = e.target.files?.[0]; if (!file) return;
            try {
                const rawBase64 = await new Promise((res, rej) => { const r = new FileReader(); r.onloadend = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });
                // Compute BOTH hashes (byte for exact match, pixel for "same image re-encoded differently")
                const hashes = await computeRefHashes(rawBase64);
                const cached = await lookupRefByHashes(hashes);
                if (cached) {
                    applyPathToSlot(slot, refType, npcIndex, cached);
                    pushRecentRef(cached);
                    toastr.success('Реф применён из кеша (дубликат не создан)', 'SLAY Images', { timeOut: 2000 });
                    e.target.value = '';
                    return;
                }
                const compressed = await compressBase64Image(rawBase64, 768, 0.8);
                const label = refType === 'npc' ? `npc${npcIndex}` : refType;
                const savedPath = await saveRefImageToFile(compressed, label, { skipDedupCheck: true });
                recordRefHashes(hashes, savedPath);
                applyPathToSlot(slot, refType, npcIndex, savedPath);
                pushRecentRef(savedPath);
                toastr.success('Фото сохранено', 'SLAY Images', { timeOut: 2000 });
            } catch (err) { iigLog('ERROR', `fileHandler: ${err?.message}`); toastr.error('Ошибка загрузки фото', 'SLAY Images'); }
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
            `<img class="slay-sc-cimg" src="${src}" alt="" loading="${i === 0 ? 'eager' : 'lazy'}" data-src="${src}">`
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
        const badgeHtml = s.stabilityText ? `<span class="slay-sc-badge ${badgeCls}">${s.stabilityText}</span>` : '';
        return `<article class="slay-sc${isSel ? ' selected' : ''}">
          ${makeCarousel(s.images)}
          <div class="slay-sc-body slay-sc-selectable" data-style="${encodedPrompt}" data-name="${encodedName}">
            <div class="slay-sc-head">
              <span class="slay-sc-name">${s.name}</span>
              ${badgeHtml}
            </div>
            ${s.desc ? `<p class="slay-sc-desc">${s.desc}</p>` : ''}
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

        document.getElementById('slay_settings_body')?.classList.toggle('iig-hidden', !settings.enabled);

        const currentNaisModel = normalizeNaisteraModel(settings.naisteraModel);
        const supportsRefs = !isNaistera || currentNaisModel === 'grok' || currentNaisModel === 'nano banana';

        document.getElementById('slay_model_row')?.classList.toggle('iig-hidden', isNaistera);
        document.getElementById('slay_size_row')?.classList.toggle('iig-hidden', !isOpenAI);
        document.getElementById('slay_quality_row')?.classList.toggle('iig-hidden', !isOpenAI);
        document.getElementById('slay_naistera_model_row')?.classList.toggle('iig-hidden', !isNaistera);
        document.getElementById('slay_naistera_aspect_row')?.classList.toggle('iig-hidden', !isNaistera);
        // slay_naistera_preset_row removed — replaced by slay_style_row (always visible)
        document.getElementById('slay_naistera_hint')?.classList.toggle('iig-hidden', !isNaistera);
        document.getElementById('slay_gemini_params')?.classList.toggle('iig-hidden', !isGemini);

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

    document.getElementById('slay_enabled')?.addEventListener('change', (e) => { settings.enabled = e.target.checked; saveSettings(); updateVisibility(); updateHeaderStatusDot(); });
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
    // Just save the model name. Don't auto-flip apiType based on model name —
    // OpenAI-compat routers expose Gemini models too, and user's explicit
    // apiType choice should be respected.
    document.getElementById('slay_model')?.addEventListener('change', (e) => {
        settings.model = e.target.value;
        saveSettings();
    });
    document.getElementById('slay_refresh_models')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget; btn.classList.add('loading');
        try { const models = await fetchModels(); const sel = document.getElementById('slay_model'); sel.innerHTML = '<option value="">-- Выберите --</option>'; for (const m of models) { const o = document.createElement('option'); o.value = m; o.textContent = m; o.selected = m === settings.model; sel.appendChild(o); } toastr.success(`Моделей: ${models.length}`, 'SLAY Images'); }
        catch (e) { toastr.error('Ошибка загрузки', 'SLAY Images'); } finally { btn.classList.remove('loading'); }
    });
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
    // Touch: tap anywhere on image to close
    overlay.querySelector('.iig-lightbox-img').addEventListener('click', close);
    // Eat all touch/pointer phases at the overlay boundary so nothing bubbles to the
    // drawer's outside-click listeners while the lightbox is up.
    const stop = e => e.stopPropagation();
    overlay.addEventListener('touchstart', stop, { passive: true });
    overlay.addEventListener('touchend', stop, { passive: true });
    overlay.addEventListener('pointerdown', stop);
    overlay.addEventListener('pointerup', stop);
    overlay.addEventListener('mousedown', stop);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay.classList.contains('open')) close(); });
    document.getElementById('chat')?.addEventListener('click', (e) => {
        const img = e.target.closest('.iig-generated-image'); if (!img) return;
        e.preventDefault(); e.stopPropagation();
        overlay.querySelector('.iig-lightbox-img').src = img.src;
        overlay.querySelector('.iig-lightbox-caption').textContent = img.alt || '';
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden'; // Prevent background scroll on iOS
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
    iigLog('INFO', `Initializing Slay Images v${SLAY_VERSION}`);

    // One-time reverse migration: if user tested the 4.2.0-preview build, their data lives
    // under suffixed keys ('slay_wardrobe' + '_preview' / 'slay_image_gen' + '_preview').
    // Move it back to the main keys on first run of stable 4.2.0. Using string concat so
    // the future replace_all rename can't collapse both sides into the same literal.
    const _PW = 'slay_wardrobe' + '_preview';
    const _PG = 'slay_image_gen' + '_preview';
    if (context.extensionSettings[_PW] && !context.extensionSettings.slay_wardrobe) {
        context.extensionSettings.slay_wardrobe = structuredClone(context.extensionSettings[_PW]);
        iigLog('INFO', 'Migrated ' + _PW + ' -> slay_wardrobe (one-time, preview upgrade)');
    }
    if (context.extensionSettings[_PG] && !context.extensionSettings.slay_image_gen) {
        context.extensionSettings.slay_image_gen = structuredClone(context.extensionSettings[_PG]);
        iigLog('INFO', 'Migrated ' + _PG + ' -> slay_image_gen (one-time, preview upgrade)');
    }

    // Legacy settings migration (pre-SLAY fork)
    if (context.extensionSettings.silly_wardrobe && !context.extensionSettings.slay_wardrobe) {
        context.extensionSettings.slay_wardrobe = structuredClone(context.extensionSettings.silly_wardrobe);
        iigLog('INFO', 'Migrated silly_wardrobe -> slay_wardrobe');
    }
    if (context.extensionSettings.inline_image_gen && !context.extensionSettings.slay_image_gen) {
        context.extensionSettings.slay_image_gen = structuredClone(context.extensionSettings.inline_image_gen);
        iigLog('INFO', 'Migrated inline_image_gen -> slay_image_gen');
    }
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
        setTimeout(() => attachRegenButtonsInRoot(document.getElementById('chat') || document.body), 400);
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
        setTimeout(() => {
            restoreRefsFromLocalStorage();
            addButtonsToExistingMessages();
            renderRefSlots();
            attachRegenButtonsInRoot(document.getElementById('chat') || document.body);
        }, 300);
    });

    // Persona switch (and many other settings changes) emits SETTINGS_UPDATED.
    // We use it just to refresh ref-slot labels — the {{user}} title needs to
    // follow whichever persona is currently active. Debounced so a burst of
    // settings saves only rerenders once.
    if (context.event_types.SETTINGS_UPDATED) {
        context.eventSource.on(context.event_types.SETTINGS_UPDATED, () => {
            renderRefSlotsDebounced();
        });
    }

    context.eventSource.makeLast(context.event_types.CHARACTER_MESSAGE_RENDERED, async (messageId) => {
        await onMessageReceived(messageId);
        // After processing, attach regen buttons to any pre-existing images in THIS message
        // (covers swipes, edits, reloaded messages)
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
            // Defer one tick so DOM patch by ST has actually applied.
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
