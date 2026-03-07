# Mermaid Diagram Viewer

A live Mermaid diagram editor and viewer powered by [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid). Renders diagrams as beautiful SVGs with 15 built-in themes.

**Live**: https://junyiacademy.github.io/mermaid/

## Features

- Live preview as you type
- 15 built-in themes (Tokyo Night, Catppuccin, Nord, Dracula, etc.)
- URL-based sharing — diagram is compressed and encoded in the URL hash
- No backend required — everything runs client-side

## Sharing Diagrams

The Mermaid source is compressed (pako deflate) and base64url-encoded into the URL hash. Open a shared link and the diagram renders immediately.

### Generate a share URL programmatically

```js
const pako = require('pako')

function encodeMermaid(code) {
  const compressed = pako.deflate(new TextEncoder().encode(code))
  const base64 = btoa(String.fromCharCode(...compressed))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `https://junyiacademy.github.io/mermaid/#c=${base64}`
}
```

### Open from terminal (macOS)

```bash
open "https://junyiacademy.github.io/mermaid/#c=<encoded>"
```

## Development

```bash
npm install
npm run dev
```

## License

MIT
