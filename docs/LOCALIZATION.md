# Localization Guide

[日本語版](ja/LOCALIZATION.md)

## Supported languages

- `ja`: Japanese (default)
- `en`: English (US)
- `fr`: French

Use the language selector in the header. The choice is saved as `web-security-hub.locale` in browser `localStorage` and is restored on the next visit.

## Locale files

Locale files are stored in `public/i18n/<locale>.json`. Name keys by stable meaning, not by a particular screen or implementation detail.

```json
{
  "nav.dynamic": "Dynamic Scan",
  "status.error": "Error: {message}"
}
```

Replace placeholders such as `{message}` with `t('status.error', { message })`.

## Add a language

1. Copy `public/i18n/en.json`, for example to `de.json`.
2. Translate every existing key.
3. Add the locale to `SUPPORTED` in `public/js/i18n.js`.
4. Add an option to `#languageSelect` in `public/index.html`.
5. Verify selector switching, primary tabs, and buttons with Playwright.

## Implementation rules

- When adding UI text, add a locale key rather than hard-coding text in JavaScript or HTML.
- Use `t()` for dynamic errors and progress messages.
- Do not translate API field names, selectors, URLs, or JSON scenario keys.
- Never include secrets in translated text or placeholder values.
