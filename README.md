# 💅🔥 SLAY Images

**SillyTavern extension for inline image generation with wardrobe system and NPC references.**

A merged extension combining the best of two worlds:
- **Wardrobe system** for managing character and user outfits
- **NPC reference system** for consistent multi-character generation (up to 4 NPCs)
- **Per-character reference storage** — each bot remembers its own ref images

Supports **OpenAI-compatible**, **Gemini / Nano-Banana**, and **Naistera / Grok** image generation APIs.

Prompts catalogue to add to your preset: https://wewwaistyping.github.io/slayimagespromts/

---

## Features

### Image Generation
- **Inline image generation** — LLM generates `<img>` tags, extension auto-generates images
- **NPC references** — upload reference photos for char, user, and up to 4 NPCs
- **Per-character refs** — each bot remembers its own ref images
- **Smart ref sending** — refs and outfit descriptions only sent for characters mentioned in the prompt
- **Lightbox** — click any generated image to view full-size (tap to close on mobile)
- **iOS/Android support** — XHR fallback, safe-area-inset, mobile-optimized modals
- **Regenerate button** — retry failed or old images from message menu

### Wardrobe v4 (Sims-style)
- **6 categories** — Full outfit, Top, Bottom, Shoes, Accessories, Hair
- **2 modes** — Full outfit or mix-and-match parts (separate modes for bot and user)
- **Tags** — Street, Home, Evening, Sleep, Sport, Beach, Other
- **For who filter** — All, Bot, User (auto-switches with bot/user tab)
- **Global wardrobe** — shared across all characters, active outfits per-character
- **Auto outfit description** — AI describes uploaded clothing via Direct API or Chat API
- **Separate describe API** — dedicated endpoint/key/model for outfit descriptions (choose Gemini or OpenAI format)
- **Hair prompt** — describes hairstyle without mentioning hair color
- **Description styles** — Detailed (costume designer) or Simple
- **Outfit injection** — OUTFIT LOCK with depth=0 for reliable LLM compliance
- **Separate image controls** — send outfit image for bot/user independently
- **🧪 Experimental collage** — merge up to 6 clothing parts into one ref image (parts mode)
- **Inline sub-forms** — upload, edit, description forms render inside wardrobe (no z-index issues on mobile)

### API Support
- **OpenAI-compatible**, **Gemini / Nano-Banana**, **Naistera / Grok**
- **Video generation** — Naistera video test mode
- **Auto-migration** — imports settings from sillyimages/notsosillynotsoimages

---

## Installation

### Method 1: SillyTavern Extension Installer
1. Open SillyTavern
2. Go to **Extensions** tab → **Install Extension**
3. Paste the repository URL:
   ```
   https://github.com/wewwaistyping/SLAYImages
   ```
4. Click **Install**
5. Reload SillyTavern

### Method 2: Manual
1. Clone or download this repository
2. Copy the `SLAYImages` folder to:
   ```
   SillyTavern/data/default-user/extensions/SLAYImages
   ```
   or (for older ST versions):
   ```
   SillyTavern/public/scripts/extensions/third-party/SLAYImages
   ```
3. Restart SillyTavern
4. Enable the extension in **Extensions** panel

---

## Setup

1. Open the **💅🔥 SLAY Images** panel in Extensions
2. Select your **API type** (OpenAI / Gemini / Naistera)
3. Enter your **endpoint** and **API key**
4. Click **Test** to verify connection
5. Select a **model** (for OpenAI/Gemini)
6. Upload **reference photos** for your characters
7. Open **Wardrobe** to upload outfits

---

## How It Works

Your LLM generates image tags in its responses:

```html
<img data-iig-instruction='{"style":"anime","prompt":"A girl walking in the rain","aspect_ratio":"16:9","image_size":"2K"}' src="[IMG:GEN]">
```

The extension intercepts these tags, sends the prompt + reference images to your image generation API, and replaces the placeholder with the generated image.

### What gets sent to the image API (Gemini)

Only for characters **mentioned by name** in the image prompt:

1. **Face ref** from char/user slot
2. **Wardrobe outfit image** (if enabled in settings)
3. **NPC refs** matched by name in prompt
4. **Context images** (previous generations, if enabled)

Additionally:
- **Outfit text description** injected into prompt (if enabled)
- **OUTFIT LOCK** injected into chat context so LLM writes correct clothing

Max 5 reference images per request. Characters not in the prompt = nothing sent for them.

---

## Инструкция на русском

### Установка
1. Откройте SillyTavern
2. Перейдите во вкладку **Расширения** → **Установить расширение**
3. Вставьте ссылку: `https://github.com/wewwaistyping/SLAYImages`
4. Нажмите **Install** → перезагрузите ST

### Настройка
1. Откройте панель **💅🔥 SLAY Images** в расширениях
2. Выберите **тип API** (OpenAI / Gemini / Naistera)
3. Введите **endpoint** и **API key**
4. Нажмите **Тест** для проверки подключения
5. Выберите **модель** (для OpenAI/Gemini)
6. Загрузите **фото-референсы** персонажей в соответствующие слоты
7. Откройте **Гардероб** и загрузите аутфиты

### Гардероб
- **Полный комплект** — одна картинка на весь аутфит. Можно прикрепить аксессуары и причёску сверху
- **По частям** — собирайте образ из категорий: верх, низ, обувь, аксессуары, причёска
- При загрузке выберите категорию, для кого (бот/юзер/все) и теги (улица, дом, вечер и т.д.)
- **Описание одежды** генерируется через ИИ (кнопка 🤖) или вводится вручную (кнопка ✏️)
- Рекомендуется всегда добавлять текстовое описание — Gemini лучше реагирует на текст чем на картинки

### Рекомендации
- Комбинируйте отправку описания и картинки одежды (настраивается в секции гардероба)
- Для описания одежды подключите отдельный дешёвый API (напр. gemini-2.0-flash) — не тратьте токены основной модели
- Рефы отправляются **только для персонажей, упомянутых в промпте** — если в сцене один персонаж, второй не тратит слоты
- Лучше загружайте картинки одежды **без человека** или обрезайте — нейронка может считать ненужную позу/лицо
- Если одежда не подтягивается — скопируйте описание из гардероба и вставьте в промпт вручную

### Известные ограничения
- Gemini может игнорировать одежду при большом количестве рефов (4+). Чем меньше картинок — тем лучше
- Экспериментальный коллаж (сборка частей в одну картинку) может страдать по качеству — используйте осторожно
- Автоописание через чат-API отправляет весь контекст чата — рекомендуется прямой API

---

## Credits

This extension is built upon the work of these original projects:

- **[notsosillynotsoimages](https://github.com/aceeenvw/notsosillynotsoimages)** by **aceeenvw** — NPC reference system, robust engine with iOS support, recursion protection, lightbox, debug logging
- **[sillyimages](https://github.com/0xl0cal/sillyimages)** by **0xl0cal** — Original image generation extension
- **[sillyimages wardrobe fork](https://github.com/delidgi/sillyimages)** by **delidgi** — Wardrobe system, outfit management, auto-analyze, avatar references, image context, video support

Merged and extended by **WEWWA** and silly claude code.

---

## License

MIT
