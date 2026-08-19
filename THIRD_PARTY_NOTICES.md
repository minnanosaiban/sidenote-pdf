# Third-party notices

## PDF.js

`public/vendor/pdfjs/pdf.min.mjs`・`public/vendor/pdfjs/pdf.worker.min.mjs`・`public/vendor/pdfjs/cmaps/`に、
PDF.js（pdfjs-dist 6.2.108）のビルド済みファイル一式をそのまま同梱しています（`public/`配下がそのまま
Cloudflare Pagesの公開対象なので、実際に配信されるのはここ）。CDN読み込みは行わず、ローカルで完結させています。

- 出典: https://github.com/mozilla/pdf.js （npm: pdfjs-dist）
- ライセンス: Apache License 2.0（全文は `public/vendor/pdfjs/LICENSE`）
- cmaps/は、埋め込みフォントを持たないCJKフォント参照PDFでも文字化けしないようにするための定義済み
  エンコーディング一式（169ファイル、約1.5MB）。実機テストで「フォント埋め込み無しの日本語PDF」が
  文字化けする不具合を確認し、同梱を決めた（app.jsのgetDocument呼び出しでcMapUrl指定）。

## Bootstrap Icons

`public/index.html` と `public/app.js` に、いくつかのアイコンをSVGとして直接埋め込んでいます
（保存・開く・画像・PDF・×アイコンなど）。CDN読み込みやWebフォント同梱は行わず、
使用する数個分のSVGパスのみをソースにコピーしています。

- 出典: https://github.com/twbs/icons
- ライセンス: MIT License

```
The MIT License (MIT)

Copyright (c) 2019-2024 The Bootstrap Authors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```
