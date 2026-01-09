# Frontend Notes

## Config formats
- `frontend/package.json` sets `"type": "module"`, so Node treats `.js` config files as ESM.
- Keep PostCSS config as CommonJS by using `frontend/postcss.config.cjs` to avoid ESM `module` errors.
