# 💅🔥 SLAY Images

**SillyTavern extension for inline image generation with wardrobe system and NPC references.**

A merged extension combining the best of two worlds:
- **Wardrobe system** for managing character and user outfits
- **NPC reference system** for consistent multi-character generation (up to 4 NPCs)
- **Per-character reference storage** — each bot remembers its own ref images

Supports **OpenAI-compatible**, **Gemini / Nano-Banana**, and **Naistera / Grok** image generation APIs.

---

## Features

### Image Generation
- **Inline image generation** — LLM generates `<img>` tags, extension auto-generates images
- **NPC references** — upload reference photos for char, user, and up to 4 NPCs
- **Per-character refs** — each bot remembers its own ref images
- **Smart ref sending** — refs only sent for characters mentioned in the prompt
- **Lightbox** — click any generated image to view full-size
- **iOS support** — XHR fallback with extended timeouts

### Wardrobe v4 (Sims-style)
- **6 categories** — Full outfit, Top, Bottom, Shoes, Accessories, Hair
- **2 modes** — Full outfit or mix-and-match parts (separate for bot and user)
- **Tags** — Street, Home, Evening, Sleep, Sport, Beach, Other
- **For who filter** — All, Bot, User
- **Global wardrobe** — shared across all characters
- **Auto outfit description** — AI describes uploaded clothing (Direct API or Chat API)
- **Hair prompt** — describes hairstyle without mentioning hair color
- **Description styles** — Detailed (costume designer) or Simple
- **Outfit injection** — OUTFIT LOCK with depth=0 for reliable LLM compliance
- **Separate controls** — send outfit image for bot/user independently
- **🧪 Experimental collage** — merge up to 6 clothing parts into one ref image

### API Support
- **OpenAI-compatible**, **Gemini / Nano-Banana**, **Naistera / Grok**
- **Separate describe API** — dedicated endpoint/key/model for outfit descriptions
- **Video generation** — Naistera video test mode

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

### Reference Priority (Gemini)
1. Character avatar face
2. User avatar face
3. Wardrobe bot outfit
4. Wardrobe user outfit
5. NPC char/user refs
6. Matched NPC references (by name in prompt)
7. Context images (previous generations)

Max 5 reference images per request.

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
