# 💅🔥 SLAY Images

**SillyTavern extension for inline image generation with wardrobe system and NPC references.**

A merged extension combining the best of two worlds:
- **Wardrobe system** for managing character and user outfits
- **NPC reference system** for consistent multi-character generation (up to 4 NPCs)
- **Per-character reference storage** — each bot remembers its own ref images
- **Character library** — save faces and names once, reuse them in every chat

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

### Wardrobe
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
- **Independent of generation** — outfit text is injected whether or not image generation is on, so you can play without pictures and still keep the bot dressed

### Character Library
- **Save a character** — the floppy icon on any reference slot stores its picture and its names
- **One character, many looks** — a persona with human, demi-human and demonic versions, or a bot with a different face per AU, all under one name
- **Look labels** — a private note per picture (Imperial AU, IRL, 2d). Shown to you, never sent to the model
- **One-tap assign** — click a look, pick a slot: {{char}}, {{user}}, NPC 1–4. The names travel with the picture
- **Grouped by any shared name** — "Dana" and "Dana, Дана" are one person, not two
- **Merge duplicates** — the same character filed twice folds into one, names union
- **Per-look tools** — crop, replace, relabel, remove without leaving the panel
- **Cleans up after itself** — removing the last look removes the character, and the picture leaves the disk only when nothing else points at it

### Image Cropping
- **Offered on every upload** — references, outfit photos, replacement pictures, new looks
- **Free-form by default**, with 1:1 / 3:4 / 4:3 / 16:9 presets
- **Crop what is already stored** — a crop button on pictures uploaded earlier
- **One checkbox to turn it off** — «Не предлагать кроп картинок» in the references section

### API Support
- **OpenAI-compatible**, **Gemini / Nano-Banana**, **Naistera / Grok**
- **Video generation** — Naistera video test mode
- **Auto-migration** — imports settings from sillyimages/notsosillynotsoimages

### Housekeeping
- **Find unreferenced pictures** — scans both image folders and counts every place a path can be used: saved looks, every wardrobe, reference slots in every chat, the recent ribbon
- **Choose what to remove** — references only, wardrobe only, or both, with a count for each
- Tells you how many, not which. For a full sweep of `user/images`, use a dedicated image manager instead

### Known limitations
- Gemini starts ignoring clothing past about four reference images — fewer pictures work better
- Experimental collage (merging parts into one picture) costs quality; use with care
- Auto-describe over the chat API sends the whole chat context — a direct API is cheaper
- The unreferenced-picture sweep reports counts, not filenames

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
7. *(по желанию)* Сохраните персонажа в **библиотеку** — дискета на слоте. В следующем чате не придётся вписывать имена заново
8. Откройте **Гардероб** и загрузите аутфиты

### Гардероб
- **Полный комплект** — одна картинка на весь аутфит. Можно прикрепить аксессуары и причёску сверху
- **По частям** — собирайте образ из категорий: верх, низ, обувь, аксессуары, причёска
- При загрузке выберите категорию, для кого (бот/юзер/все) и теги (улица, дом, вечер и т.д.)
- **Описание одежды** генерируется через ИИ (кнопка 🤖) или вводится вручную (кнопка ✏️)
- Рекомендуется всегда добавлять текстовое описание — Gemini лучше реагирует на текст чем на картинки
- Гардероб **не зависит от генерации картинок**: можно выключить генерацию и играть текстом, а описание одежды всё равно будет уходить в промпт

### Сохранённые персонажи
Библиотека лиц и имён, чтобы не вписывать одно и то же в каждом новом чате.

- Дискета на слоте рефа сохраняет **картинку вместе с именами**
- У одного персонажа может быть **несколько образов**: хуман-версия, деми, демоническая — или своя мордашка на каждую АУ. Всё под одним именем
- **Подпись образа** — заметка для вас (Имперская АУ, irl, 2д). ИИ её не видит
- Клик по образу → выбираете слот: {{char}}, {{user}}, NPC 1–4. **Имена подставляются вместе с картинкой**
- Персонажи склеиваются **по любому совпавшему имени**: «Дана» и «Dana, Дана» — один человек
- **Объединение** — если один и тот же персонаж завёлся дважды, их можно свести в одного
- У каждого образа свои кнопки: обрезать, заменить, подпись, убрать
- Когда убираете последний образ — уходит и персонаж. Картинка удаляется с диска только если на неё больше **никто** не ссылается, и об этом вам скажут заранее

### Обрезка картинок
- Предлагается **при каждой загрузке**: рефы, вещи гардероба, замена картинки, новый образ
- По умолчанию **свободная рамка**, есть готовые пропорции 1:1, 3:4, 4:3, 16:9
- Уже загруженную картинку тоже можно обрезать — кнопка рядом с ней
- Не нужна — снимается галочкой **«Не предлагать кроп картинок»** в секции референсов

Полезно, если вы кидаете фото целиком, а на реф должно попасть только лицо или только одежда.

### Ничьи картинки
Со временем в папках накапливаются файлы, на которые уже ничего не ссылается — удалённые вещи, заменённые рефы, старые образы.

Кнопка **«Найти ничьи картинки»** проверяет обе папки и считает **все** места, где путь может использоваться: сохранённые образы, любой гардероб, слоты рефов во всех чатах, лента недавних. Потом предлагает выбор: только референсы, только гардероб, или всё сразу — с числом файлов в каждом варианте.

Важно: показывается **сколько**, а не **какие**. Если нужна полноценная уборка всей папки `user/images` — берите отдельный менеджер картинок, здесь такого не будет.

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
- Поиск ничьих картинок говорит, сколько файлов лишние, но не показывает какие именно

---

## Credits

This extension is built upon the work of these original projects:

- **[notsosillynotsoimages](https://github.com/aceeenvw/notsosillynotsoimages)** by **aceeenvw** — NPC reference system, robust engine with iOS support, recursion protection, lightbox, debug logging
- **[sillyimages](https://github.com/0xl0cal/sillyimages)** by **0xl0cal** — Original image generation extension
- **[sillyimages wardrobe fork](https://github.com/delidgi/sillyimages)** by **delidgi** — Wardrobe system, outfit management, auto-analyze, avatar references, image context, video support

Merged and extended by **WEWWA** and silly claude code.

---

## License

**AGPL-3.0-or-later** — see [LICENSE](./LICENSE).

Copyright (C) 2026 Wewwa (https://github.com/wewwaistyping)

SLAY Images is a derivative work of
[notsosillynotsoimages](https://github.com/aceeenvw/notsosillynotsoimages) by **aceeenvw**,
which is licensed under AGPL-3.0. Its NPC reference system, iOS support, lightbox and
related code are still present here, so this project is distributed under the same terms.
