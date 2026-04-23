# Plan: Рефакторинг инжекции стиля в SLAYimages по образцу sillyimages

## Context
В SLAYimages стиль инжектируется в промпт дублированным inline-кодом в трёх функциях (`generateImageOpenAI`, `generateImageGemini`, `generateImageNaistera`). В sillyimages есть единая функция `injectStyleBlock`. Цель — вынести логику в одну функцию, убрать дублирование, добавить замену существующего `[STYLE:]` в промпте.

## Critical Files
- `f:\My Works\Coding\Analyzing\SLAYimages\index.js`

## Implementation

### Шаг 1 — Добавить константу и функцию после блока констант IIG-модуля (около line 1286)

```js
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
```

### Шаг 2 — Заменить inline-инжекции в 3 функциях

**`generateImageOpenAI` (line 1941):**
```js
// было:
let fullPrompt = style ? `[Style: ${style}] ${prompt}` : prompt;
// стало:
let fullPrompt = injectStyleBlock(prompt, style);
```

**`generateImageGemini` (line 2065):**
```js
// было:
let fullPrompt = style ? `[Style: ${style}] ${prompt}` : prompt;
// стало:
let fullPrompt = injectStyleBlock(prompt, style);
```

**`generateImageNaistera` (line 2104):**
```js
// было:
const fullPrompt = labelPrefix + (style ? `[Style: ${style}] ${prompt}` : prompt);
// стало:
const fullPrompt = labelPrefix + injectStyleBlock(prompt, style);
```

## Поведенческие изменения
- Формат меняется с `[Style: X] prompt` на `[STYLE: X]\n\nprompt` (стиль на отдельной строке перед промптом)
- Если в промпте уже есть `[STYLE: ...]` или `[Style: ...]` — заменяется, а не дублируется
- `STYLE_BLOCK_RE` использует флаг `gi` — case-insensitive, поэтому старый формат `[Style: ...]` тоже обрабатывается

## Verification
1. Открыть SillyTavern, выбрать стиль в SLAY-пикере
2. Сгенерировать изображение через Gemini/OpenAI/Naistera
3. Убедиться, что в логах (`iigLog`) промпт содержит `[STYLE: ...]` на первой строке
4. Проверить, что если промпт вручную содержит `[Style: old]`, он заменяется на выбранный стиль
