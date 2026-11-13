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
- **Lightbox tools** — on any generated picture:
  - **Edit** — describe one change ("make it night", "no glasses"); the current picture goes as the first reference, so the rest of the frame stays
  - **Prompt** — read and fix the picture's prompt, then redraw with it; the new prompt is written into the tag
  - **Use as reference** — put the picture into any slot: {{char}}, {{user}}, NPC 1–4, Location 1–3
  - **Undo** — after Edit or Prompt, a toast brings the previous picture back
  - **Pinch-zoom** on phones
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
- **Whose item** — an item can belong to one or several characters, or be shared. In a group chat the «Only <name>» filter is on by default, and quick swap only offers the member's own and shared items. An item handed to someone else comes off whoever no longer owns it

### Character Library
- **Save a character** — the floppy icon on any reference slot stores its picture and its names
- **One character, many looks** — a persona with human, demi-human and demonic versions, or a bot with a different face per AU, all under one name
- **Look labels** — a private note per picture (Imperial AU, IRL, 2d). Shown to you, never sent to the model
- **One-tap assign** — click a look, pick a slot: {{char}}, {{user}}, NPC 1–4. The names travel with the picture
- **Grouped by any shared name** — "Kate" and "Kate, Катя" are one person, not two
- **Merge duplicates** — the same character filed twice folds into one, names union
- **Per-look tools** — crop, replace, relabel, remove without leaving the panel
- **Cleans up after itself** — removing the last look removes the character, and the picture leaves the disk only when nothing else points at it
- **From avatar** — {{char}} and {{user}} slots can take the current bot's or persona's avatar; an NPC slot picks any character card. Crop and dedup work as with an upload
- **Reference cards** — export a saved character or place as one PNG: the cover is a normal picture, the other looks, names and (for places) the description ride inside. Choose which looks go in. Import recognises character or place and offers to merge with an existing one of the same name. Folders are not exported. Send the file as a file, not as a photo — messengers strip the data from photos

### Locations
- **Three location slots per character** (in a group chat — per member; every member's places are available)
- **Picture, description, or both** — a place can go as a reference picture, as text added to the image prompt (no reference spent), or both
- **Describe from picture** — the same connection that describes outfits writes a short description of the place: layout, objects, materials, light. No people, no time of day, no weather
- **«Here now»** — pin a place for the current chat. It goes to every picture, and its description reaches the bot the way a worn outfit does, so the bot writes image prompts in that place. Without a pin, the place named first in the prompt is used
- **🧪 Without image generation** — an optional checkbox keeps the pinned place in the story text even with pictures off
- **Collapsible** — folded until you open it once; tap the «Локации» header. Filled places keep working while folded
- **Saved with their description** — the floppy icon stores a place in the library together with its description, and putting it back into a slot restores both

### Studio
- **Pictures outside the chat** — the 🎨 button next to the wardrobe opens a separate window; results don't go into messages
- **Presets** — Free, Portrait, Character sheet, Location for a reference, Cover, Scene from chat
- **Who and where** — chips from the current references pick who is in the frame and which place; picked by chip = sent without the "name in prompt" check
- **Rewrite with preset** — turn a short idea into a full image prompt using your preset's image rules, optionally with the last messages or the card and lorebook
- **Results stay in the chat's studio** — send to chat as a SLAY tag (↻ and Edit keep working), use as a reference, edit, download
- **On PC** — a floating window you can move and resize, or full screen

### Group chats
- **Faces follow the speaker** — the author's face goes as {{char}}, other members as named references with their own outfits
- **One {{user}} per group** — filled once from a member's solo chat, with a note saying where it came from. No silent borrowing at generation time

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
- **Pick with previews** — every unused file as a thumbnail, grouped by month; untick what to keep, long-press to view it large, then delete the rest

### Known limitations
- Gemini starts ignoring clothing past about four reference images — fewer pictures work better
- Experimental collage (merging parts into one picture) costs quality; use with care
- Auto-describe over the chat API sends the whole chat context — a direct API is cheaper
- The unreferenced-picture sweep reports counts, not filenames
- More than 4–5 references per picture makes models mix up faces and clothes. The references block shows a warning when a picture may get five

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
   - The key is stored in SillyTavern's `settings.json` (extension settings), like most extensions do — don't share that file or screenshots of it.
   - **Naistera** is a third-party service, not part of SLAY or SillyTavern: your prompts and reference photos go to their server.
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
   - Ключ хранится в `settings.json` таверны (в настройках расширения), как у большинства расширений — не отправляйте этот файл и его скриншоты.
   - **Наистера** — сторонний сервис, не часть SLAY и не таверны: промпты и фото-рефы уходят на их сервер.
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
- **Подпись образа** — заметка для вас (школьная АУ, irl, 2д). ИИ её не видит
- Клик по образу → выбираете слот: {{char}}, {{user}}, NPC 1–4. **Имена подставляются вместе с картинкой**
- Персонажи склеиваются **по любому совпавшему имени**: «Катя» и «Kate, Катя» — один человек
- **Объединение** — если один и тот же персонаж завёлся дважды, их можно свести в одного
- У каждого образа свои кнопки: обрезать, заменить, подпись, убрать
- Когда убираете последний образ — уходит и персонаж. Картинка удаляется с диска только если на неё больше **никто** не ссылается, и об этом вам скажут заранее

### Локации
- У каждого персонажа **три слота локаций** (в группе — у каждого участника свои)
- Место можно отправлять **картинкой, описанием или и тем и другим**. Описание не тратит реф: текст просто добавляется к промпту картинки
- **«Описать по картинке»** — тем же подключением, что описывает одежду. Без людей, времени суток и погоды, чтобы описание подходило к любой сцене
- **«Сейчас здесь»** — отметь место для этого чата. Оно идёт на каждую картинку, а его описание видит бот, как надетую одежду, и пишет промпты уже в этом месте. Без отметки берётся место, названное в промпте первым
- **🧪 Галочка с колбой** — описание места уходит боту и при выключенной генерации, чтобы место держалось в тексте ролевой
- Блок **по умолчанию свёрнут** — тапни по заголовку «Локации», чтобы открыть. Дальше запоминается твой выбор. Заполненные места работают и в свёрнутом блоке
- Дискета сохраняет локацию в библиотеку **вместе с описанием**

### Студия
- Кнопка 🎨 рядом с гардеробом — картинки **не в чат**, в отдельном окне
- Заготовки: свободно, портрет, лист персонажа, локация для рефа, обложка, сцена из чата
- Кто и где в кадре выбирается чипами из рефов
- **«Переделать по пресету»** — из короткой идеи получается полный промпт по правилам картинок из твоего пресета
- Готовую картинку можно отправить в чат (↻ и «Правка» там работают), сделать рефом, поправить, скачать
- На ПК — плавающее окно, его можно двигать и растягивать

### Просмотр картинки
- **«Правка»** — напиши, что поменять. Текущая картинка уходит рефом, остальное остаётся как было
- **«Промпт»** — посмотреть и поправить промпт картинки, перерисовать с ним
- **«Сделать рефом»** — поставить картинку в любой слот, включая локации
- После правки уведомление возвращает прошлую картинку
- На телефоне картинку можно увеличивать пальцами

### Чей наряд
- Вещь гардероба может принадлежать одному или нескольким персонажам или быть общей
- В группе фильтр «Только <имя>» включён сразу, быстрый свап предлагает только вещи участника и общие
- Отдала вещь другому — она снимается с того, кому больше не принадлежит

### Карточки рефов
- В «Сохранённых» персонажа или локацию можно **экспортировать одним PNG**. Обложка — обычная картинка, остальные образы, имена и описание лежат внутри
- Какие образы войдут, выбираешь галочками
- **Импорт** сам понимает, персонаж это или локация. Если такой уже есть, предложит добавить образы к нему
- Папки в карточку не кладутся
- В мессенджере отправляй **файлом, а не фото**, иначе содержимое вырежется

### С аватарки
- Тап по слоту {{char}} или {{user}} → «С аватарки»: берётся аватарка бота или текущей персоны
- У NPC — список карточек с поиском, имя подставится само
- Дальше как при загрузке: обрезка, сжатие, без дубликатов

### Группы
- Лицо автора сообщения идёт как {{char}}, остальные участники — как NPC, со своей одеждой
- Слот юзера в группе один. Он один раз заполняется фото из соло-чата участника, и плашка говорит, откуда фото. Тихих подмен при генерации нет

### Обрезка картинок
- Предлагается **при каждой загрузке**: рефы, вещи гардероба, замена картинки, новый образ
- По умолчанию **свободная рамка**, есть готовые пропорции 1:1, 3:4, 4:3, 16:9
- Уже загруженную картинку тоже можно обрезать — кнопка рядом с ней
- Не нужна — снимается галочкой **«Не предлагать кроп картинок»** в секции референсов

Полезно, если вы кидаете фото целиком, а на реф должно попасть только лицо или только одежда.

### Ничьи картинки
Со временем в папках накапливаются файлы, на которые уже ничего не ссылается — удалённые вещи, заменённые рефы, старые образы.

Кнопка **«Найти ничьи картинки»** проверяет обе папки и считает **все** места, где путь может использоваться: сохранённые образы, любой гардероб, слоты рефов во всех чатах, лента недавних. Потом показывает все лишние файлы маленькими превью по месяцам (вкладки «Референсы» и «Гардероб»). Все отмечены — тапом снимаете то, что хотите оставить, долгим нажатием смотрите картинку крупно. «Удалить отмеченные» — одно подтверждение, и готово.

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
- Больше 4–5 рефов на картинку — модель путает лица и одежду. Блок рефов предупреждает, когда на картинку может уйти пять

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
