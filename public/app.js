"use strict";

// アイコン（Bootstrap Icons, MIT License）を絵文字の代わりに生SVGで埋め込む。
const ICON_X =
  '<svg class="icon" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">' +
  '<path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8z"/></svg>';

const doc = document.getElementById("doc");
const docRightEl = document.getElementById("docRight");
const clearBtn = document.getElementById("clearBtn");
const popoverEl = document.getElementById("notePopover");
const popoverInput = document.getElementById("notePopoverInput");
const titleInput = document.getElementById("titleInput");
const saveBtn = document.getElementById("saveBtn");
const saveMdBtn = document.getElementById("saveMdBtn");
const savePdfBtn = document.getElementById("savePdfBtn");
const printDocEl = document.getElementById("printDoc");
const loadInput = document.getElementById("loadInput");
const imgInput = document.getElementById("imgInput");
const saveStatusEl = document.getElementById("saveStatus");
const resumeApplyBtn = document.getElementById("resumeApply");
const resumeDiscardBtn = document.getElementById("resumeDiscard");
const settingsBtn = document.getElementById("settingsBtn");
const settingsPanel = document.getElementById("settingsPanel");
const nameBlackInput = document.getElementById("nameBlack");
const nameBlueInput = document.getElementById("nameBlue");
const showNamesToggle = document.getElementById("showNamesToggle");
const helpBtn = document.getElementById("helpBtn");
const helpPanel = document.getElementById("helpPanel");

let anchorIdSeq = 1;
let replyIdSeq = 1;
let imageIdSeq = 1;
// anchorId -> [{id, text, color}, ...]（1つの一文・画像に複数のコメントを重ねられる＝返信スレッド形式）
// 引用された原文自体はDOM（.note-anchorのspan）がそのまま保持するのでここには持たない。
const notesByAnchor = new Map();
let pendingTarget = null;             // { type: "text", range } | { type: "image", paraEl } | { type: "reply", anchorId }
let lastUsedColor = "black";          // 直前に選んだ色をポップオーバーの初期選択にする
const AUTHOR_COLOR_HEX = { black: "#31333f", blue: "#1a73e8", red: "#d33" };
// 黒・青は「誰か」を表す名前を「設定」で自由に変えられる（例：黒=Tomo、青=Toko）。赤は「重要」固定。
const colorNames = { black: "自分", blue: "共有相手" };
function colorLabel(color) {
  return color === "red" ? "重要" : (colorNames[color] || color);
}
// サイドノートに「自分：」等の名前を表示するかどうか（デフォルトはオフ＝表示しない。色分けだけで足りる場合が多いため）。
// この端末の個人的な表示設定として扱い、.jsonへは保存しない（md書き出しには名前を常に含める＝別扱い）。
let showAuthorLabel = false;

const debounce = (fn, ms) => {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};
const setStatus = (msg) => { saveStatusEl.textContent = msg || ""; };
const timestamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

// ---- ノート本文は簡易Markdown（**太字**と<u>下線</u>のみ許可） ----
function formatNoteText(raw) {
  const esc = raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/&lt;u&gt;(.+?)&lt;\/u&gt;/g, "<u>$1</u>");
}

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// 選択範囲がロック済み注釈（.note-anchor）や画像ブロック（.para-image）にかかっていないか確認する。
// 原文の改変を防ぐため、これらをまたぐ選択には太字/下線もノート追加も適用しない。
function rangeOverlapsLockedAnchor(range) {
  return Array.from(doc.querySelectorAll(".note-anchor, .para-image")).some((el) => range.intersectsNode(el));
}

// ---- 貼り付けは常にプレーンテキスト化した上で、1行＝1段落(.para)に組み直す ----
// （書式を持ち込まないのに加えて、行ごとにインデント／ぶら下げインデントを適用できるようにするため）
function linesToParaHtml(text) {
  return text.split(/\r\n|\r|\n/)
    .map((line) => line.length ? `<div class="para">${escapeHtml(line)}</div>` : `<div class="para"><br></div>`)
    .join("");
}

// クリップボードに画像が含まれる場合は画像ブロックとして挿入し、無ければ従来通りテキスト化する。
doc.addEventListener("paste", (e) => {
  const cd = e.clipboardData || window.clipboardData;
  const imageItem = Array.from(cd.items || []).find((it) => it.type && it.type.startsWith("image/"));
  if (imageItem) {
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (file) insertImageBlock(file);
    return;
  }
  e.preventDefault();
  const text = cd.getData("text/plain");
  if (text) document.execCommand("insertHTML", false, linesToParaHtml(text));
});

// 文書は常に最低1つの.para（空でも）を持つ状態にしておく。空の#docに直接入力し始めた場合でも
// インデント操作の対象（カーソルが属する.para）が存在するようにするため。
function resetDoc() {
  doc.innerHTML = '<div class="para"><br></div>';
}

// 空の時にplaceholderを出す（contenteditableはネイティブ対応が無いためCSSではなくJSで判定）
function updatePlaceholder() {
  doc.classList.toggle("empty", doc.textContent.trim() === "" && doc.querySelectorAll(".note-anchor, .para-image").length === 0);
}
// 画像ブロックはBackspace/Deleteでのブラウザ標準の削除に任せている（専用の削除ボタンは置かない）ため、
// テキストの編集と同じ"input"イベントでも通し番号・サイドノート欄を必ず作り直す
// （そうしないと、画像を削除してもサイドノート欄にその残骸が残ってしまう）。
doc.addEventListener("input", () => { updatePlaceholder(); renumberAndLayout(); autoSaveDebounced(); });
resetDoc();
updatePlaceholder();

clearBtn.onclick = () => {
  resetDoc();
  notesByAnchor.clear();
  renumberAndLayout();
  updatePlaceholder();
  autoSaveDebounced();
};

// ---- 保存・読み込み（.jsonファイル） ----
// 長文の作業を前提に、途中まで進めた内容をファイルとして残せるようにする。
// 案件ごとに別ファイルとして残せるよう、タイトル欄の内容をファイル名に含める。
function projectTitle() {
  return titleInput.value.trim();
}

function serializeProject() {
  return {
    app: "sidenote-pdf",
    version: 3,
    title: projectTitle(),
    savedAt: new Date().toISOString(),
    docHTML: doc.innerHTML,
    notesByAnchor: Array.from(notesByAnchor.entries()),   // [anchorId, [{id,text,color}, ...]][]
    anchorIdSeq,
    replyIdSeq,
    imageIdSeq,
    colorNames: { ...colorNames },   // 黒・青の名前もファイルに残す（開いた人が同じ表示で見られるように）
  };
}

function applyProjectData(data) {
  if (!data || typeof data.docHTML !== "string") throw new Error("invalid project data");
  doc.innerHTML = data.docHTML;
  notesByAnchor.clear();

  if (Array.isArray(data.notesByAnchor)) {
    data.notesByAnchor.forEach(([anchorId, notes]) => notesByAnchor.set(anchorId, notes || []));
    anchorIdSeq = typeof data.anchorIdSeq === "number" ? data.anchorIdSeq : notesByAnchor.size + 1;
    replyIdSeq = typeof data.replyIdSeq === "number" ? data.replyIdSeq : replyIdSeq;
  } else if (Array.isArray(data.notes)) {
    // 旧形式（1範囲=1ノート、data-note-id属性）の.jsonとの後方互換。
    doc.querySelectorAll("[data-note-id]").forEach((el) => {
      el.dataset.anchorId = el.dataset.noteId;
      el.removeAttribute("data-note-id");
    });
    data.notes.forEach(([anchorId, text]) => {
      notesByAnchor.set(anchorId, [{ id: "r" + replyIdSeq++, text, color: "black" }]);
    });
    anchorIdSeq = typeof data.noteIdSeq === "number" ? data.noteIdSeq : notesByAnchor.size + 1;
  }

  imageIdSeq = typeof data.imageIdSeq === "number" ? data.imageIdSeq : doc.querySelectorAll(".para-image").length + 1;
  if (data.colorNames && data.colorNames.black) colorNames.black = data.colorNames.black;
  if (data.colorNames && data.colorNames.blue) colorNames.blue = data.colorNames.blue;
  nameBlackInput.value = colorNames.black;
  nameBlueInput.value = colorNames.blue;
  updateColorSwatchLabels();
  titleInput.value = data.title || "";
  // innerHTMLの再代入で.para-imageのボタン等のイベントリスナーは失われるため、必ず再バインドする。
  doc.querySelectorAll(".para-image").forEach(bindImageParaEvents);
  renumberAndLayout();
  updatePlaceholder();
}

// ファイル名に使えない文字を落とすだけの軽いサニタイズ（Windows/Mac共通のNG文字を除外）。
const sanitizeFilename = (s) => s.replace(/[\\/:*?"<>|]/g, "_");

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

saveBtn.onclick = () => {
  const data = serializeProject();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const namePart = projectTitle() ? `-${sanitizeFilename(projectTitle())}` : "";
  const filename = `sidenote${namePart}-${timestamp()}.json`;
  downloadBlob(blob, filename);
  setStatus(`保存しました：${filename}`);
};

// ---- Markdown書き出し（MkDocs専用。弁護士とはjsonで共有する運用になったため、Obsidian互換は考慮しない）----
// Jupyter Book（sphinx-book-theme）のMargin機能と同じ仕組みを想定：
// 実体を確認したところ、あちらはJSではなくCSS（float + マイナスマージン）で余白に出している。
// ただしその方式は「注釈の中身が、対応する本文のすぐ近く（同じ場所）に置かれている」ことが前提。
// 標準のfootnotes記法（[^N] / [^N]: 内容）は中身をページ最下部に集めてしまうため、floatでは正しい
// 高さに来ない。そのため、脚注記法はやめて<aside class="margin">を各段落の直後に直接埋め込む方式にする
// （hotline側はCSSのfloatだけで済み、JSでの位置計算が不要になる）。
// 画像はimages/フォルダに実ファイルとして書き出し、.mdと一緒にzipにまとめる
// （data URLのままmdに埋め込むと.mdが肥大化し、MkDocs側のgit管理にも不向きなため）。

// Markdownの記号として誤解釈されると困る「原文（貼り付けた地の文）」向けの強めのエスケープ。
function escapeMarkdown(text) {
  return text.replace(/([\\`*_[\]])/g, "\\$1");
}

// data URL（"data:image/png;base64,...."）から拡張子とバイト列を取り出す。
function dataUrlExt(dataUrl) {
  const m = /^data:image\/(png|jpeg|jpg|gif|webp)/.exec(dataUrl);
  if (!m) return "png";
  return m[1] === "jpeg" ? "jpg" : m[1];
}
function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// .para内のノード（テキスト・<strong>・<u>・.note-anchor）を再帰的にMarkdown文字列へ変換する。
// .note-anchorの中身は常にプレーンテキストのみを持つ（ノート追加時にrange.toString()で
// 平文化されるため、太字/下線がかかっていてもノート化した時点で失われる＝既知の制約）。
// 通し番号は<sup>N</sup>だけを本文中に残す（リンク先の脚注は無いので、リンクにはしない）。
function paraNodeToMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) return escapeMarkdown(node.textContent);
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  if (node.tagName === "BR") return "";
  if (node.classList && node.classList.contains("note-anchor")) {
    const num = node.querySelector(".note-num")?.textContent || "";
    const quoted = node.querySelector("span")?.textContent || "";
    return escapeMarkdown(quoted) + (num ? `<sup>${num}</sup>` : "");
  }
  const inner = Array.from(node.childNodes).map(paraNodeToMarkdown).join("");
  if (node.tagName === "STRONG") return `**${inner}**`;
  if (node.tagName === "U") return `<u>${inner}</u>`;
  return inner;   // 未知の要素はテキストだけ拾う
}

// 1件のアンカー（一文・画像）が持つノートの配列を<aside class="margin">1個にまとめる。
// **太字**・<u>下線</u>はここでHTMLへ変換する（脚注記法をやめたのでmd_in_html拡張の有無に依存しない）。
function buildAsideHtml(num, notes) {
  const body = notes
    .map((n) => `<strong>${escapeHtml(colorLabel(n.color))}：</strong>${formatNoteText(n.text)}`)
    .join("<br>");
  return `<aside class="margin"><sup>${num}</sup> ${body}</aside>`;
}

function paraToMarkdownBlock(paraEl) {
  // インデントは行頭に本物の非改行スペース文字(U+00A0)を置いて表現する。
  // 生の.mdファイルを直接見ても字下げに見え、かつMarkdown側の「行頭の空白は畳んで消す」処理は
  // 半角スペース(U+0020)だけが対象でU+00A0は対象外のため、そのまま残る（"&nbsp;"という文字列を
  // 書く方式だと、レンダリングされるまでは文字列そのものにしか見えず分かりにくいので変更した）。
  // ぶら下げインデント（2行目以降だけの字下げ）はMarkdown単体では表現できないため非対応（既知の制約）。
  const level = Number(paraEl.dataset.indentLevel || 0);
  const indent = level > 0 ? " ".repeat(level * 2) : "";
  const bodyMd = indent + Array.from(paraEl.childNodes).map(paraNodeToMarkdown).join("");

  // その段落内にある注釈は、段落の直後にasideとしてまとめて出す（複数あれば出現順に並べる）。
  // 段落の途中の正確な高さには来ないが、脚注として最下部に飛ばすよりずっと本文の近くに置ける。
  const asides = Array.from(paraEl.querySelectorAll(".note-anchor"))
    .map((anchor) => {
      const num = anchor.querySelector(".note-num")?.textContent;
      const notes = notesByAnchor.get(anchor.dataset.anchorId) || [];
      return num && notes.length ? buildAsideHtml(num, notes) : null;
    })
    .filter(Boolean);

  return [bodyMd, ...asides].join("\n\n");
}

function buildMarkdownExport() {
  const lines = [];
  const imageFiles = [];
  let imgFileSeq = 1;

  Array.from(doc.children).forEach((child) => {
    if (!child.classList || !child.classList.contains("para")) return;
    if (child.classList.contains("para-image")) {
      const imgEl = child.querySelector(".para-image-img");
      const fname = `img${imgFileSeq++}.${dataUrlExt(imgEl.src)}`;
      imageFiles.push({ name: `images/${fname}`, bytes: dataUrlToBytes(imgEl.src) });

      const blocks = [`![スクショ](images/${fname})`];
      const badge = child.querySelector(".note-anchor");
      const num = badge?.querySelector(".note-num")?.textContent;
      const notes = badge ? notesByAnchor.get(badge.dataset.anchorId) || [] : [];
      if (num && notes.length) blocks.push(buildAsideHtml(num, notes));
      lines.push(blocks.join("\n\n"));
    } else {
      lines.push(paraToMarkdownBlock(child));
    }
  });

  const titleLine = projectTitle() || "無題";
  const frontmatter = `---\ntitle: "${titleLine.replace(/"/g, '\\"')}"\n---\n\n`;

  return { mdText: frontmatter + lines.join("\n\n") + "\n", imageFiles, titleLine };
}

saveMdBtn.onclick = () => {
  const { mdText, imageFiles, titleLine } = buildMarkdownExport();
  const files = [
    { name: `${sanitizeFilename(titleLine)}.md`, bytes: new TextEncoder().encode(mdText) },
    ...imageFiles,
  ];
  const blob = buildZipBlob(files);
  const namePart = projectTitle() ? `-${sanitizeFilename(projectTitle())}` : "";
  const filename = `sidenote${namePart}-${timestamp()}.zip`;
  downloadBlob(blob, filename);
  setStatus(`書き出しました：${filename}（zip内に.mdと画像のimages/フォルダ）`);
};

// ---- A4 PDF化（ブラウザの印刷機能を使う）----
// 独自にPDFを組み立てるのではなく、印刷用CSSを当てた#printDocをブラウザの印刷（→PDFに保存）に渡す方式。
// サイドノートは画面のような絶対座標ではなく、mdと同じくJupyter Book方式（段落・画像とfloatで隣り合わせる）
// にする。ページをまたぐレイアウトでは絶対座標が使えないため。

// #doc内のノードをprintDoc用のDOMへ再帰的に組み立てる（Markdown版のparaNodeToMarkdownと同じ考え方）。
function buildPrintNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent);
  if (node.nodeType !== Node.ELEMENT_NODE) return document.createDocumentFragment();
  if (node.tagName === "BR") return document.createElement("br");
  if (node.classList && node.classList.contains("note-anchor")) {
    const frag = document.createDocumentFragment();
    const quoted = node.querySelector("span")?.textContent || "";
    frag.appendChild(document.createTextNode(quoted));
    const num = node.querySelector(".note-num")?.textContent;
    if (num) {
      const sup = document.createElement("sup");
      sup.textContent = num;
      frag.appendChild(sup);
    }
    return frag;
  }
  const wrapTag = node.tagName === "STRONG" ? "strong" : node.tagName === "U" ? "u" : null;
  const container = wrapTag ? document.createElement(wrapTag) : document.createDocumentFragment();
  Array.from(node.childNodes).forEach((child) => container.appendChild(buildPrintNode(child)));
  return container;
}

function buildPrintAsideEl(num, notes) {
  const aside = document.createElement("aside");
  aside.className = "print-aside";
  const sup = document.createElement("sup");
  sup.textContent = num;
  aside.appendChild(sup);
  aside.appendChild(document.createTextNode(" "));
  notes.forEach((note, i) => {
    if (i > 0) aside.appendChild(document.createElement("br"));
    // PDFは画面と同じく色が見える（mdと違い色の情報を残せる）ため、「設定」の名前表示オンオフ・
    // 色分けとも画面の表示にそのまま揃える（mdは常に名前を出す＝別扱いのまま）。
    if (showAuthorLabel) {
      const strong = document.createElement("strong");
      strong.textContent = `${colorLabel(note.color)}：`;
      aside.appendChild(strong);
    }
    const span = document.createElement("span");
    span.style.color = AUTHOR_COLOR_HEX[note.color] || AUTHOR_COLOR_HEX.black;
    span.innerHTML = formatNoteText(note.text);   // **太字**・<u>下線</u>をHTMLへ変換（画面の表示と同じ関数）
    aside.appendChild(span);
  });
  return aside;
}

// 段落を「注釈の直後」で複数の<p class="print-para print-para-cont">に分割し、各セグメントの
// すぐ後ろに対応するasideを挟む。分割しないと、1段落の途中の離れた場所にある注釈同士が
// 段落の後ろにまとめて出てしまい、対応する文から離れた位置に見えてしまう（既知の制約）。
// 2026-08-16：以前この方式は実機の印刷プレビューでサイドノートが消える不具合が2回再現し撤回した。
// 原因はDOM構築ロジックではなく（jsdomでは正しいと確認済み）、印刷直前のDOM大量書き換え後に
// レイアウトが確定しないままprintのレンダリングパスに入っていた可能性が高いと判断し、
// buildPrintDoc()の最後に強制リフローを入れた上で再挑戦する（下記の見出しコメント参照）。
function buildPrintParaSegments(paraEl) {
  const level = Number(paraEl.dataset.indentLevel || 0);
  const hanging = paraEl.dataset.hanging === "1";
  const base = level * INDENT_STEP_EM;

  // 子ノードをnote-anchorの直後で区切り、セグメント（ノードの配列）の配列にする
  const segments = [];
  let current = [];
  Array.from(paraEl.childNodes).forEach((n) => {
    current.push(n);
    if (n.nodeType === Node.ELEMENT_NODE && n.classList.contains("note-anchor")) {
      segments.push(current);
      current = [];
    }
  });
  if (current.length) segments.push(current);
  if (!segments.length) segments.push([]);   // 空段落（<br>のみ等）でも1つは出力する

  const elements = [];
  segments.forEach((nodes, i) => {
    const p = document.createElement("p");
    p.className = segments.length > 1 ? "print-para print-para-cont" : "print-para";
    if (level > 0 || hanging) {
      p.style.paddingLeft = `${base + (hanging ? HANGING_EM : 0)}em`;
      // ぶら下げの字下げ（text-indentのマイナス）は「段落の1行目」だけに付ける。分割後の
      // 2セグメント目以降は同じ段落の続きであって新しい段落の先頭ではないため付けない。
      p.style.textIndent = (hanging && i === 0) ? `-${HANGING_EM}em` : "0";
    }
    nodes.forEach((n) => p.appendChild(buildPrintNode(n)));
    elements.push(p);

    const last = nodes[nodes.length - 1];
    if (last && last.nodeType === Node.ELEMENT_NODE && last.classList.contains("note-anchor")) {
      const num = last.querySelector(".note-num")?.textContent;
      const notes = notesByAnchor.get(last.dataset.anchorId) || [];
      if (num && notes.length) elements.push(buildPrintAsideEl(num, notes));
    }
  });
  return elements;
}

function buildPrintDoc() {
  printDocEl.innerHTML = "";

  const title = projectTitle();
  if (title) {
    const titleEl = document.createElement("div");
    titleEl.className = "print-title";
    titleEl.textContent = title;
    printDocEl.appendChild(titleEl);
  }

  Array.from(doc.children).forEach((child) => {
    if (!child.classList || !child.classList.contains("para")) return;

    if (child.classList.contains("para-image")) {
      const imgEl = child.querySelector(".para-image-img");
      const printImg = document.createElement("img");
      printImg.className = "print-img";
      printImg.src = imgEl.src;
      printDocEl.appendChild(printImg);

      const badge = child.querySelector(".note-anchor");
      const num = badge?.querySelector(".note-num")?.textContent;
      const notes = badge ? notesByAnchor.get(badge.dataset.anchorId) || [] : [];
      if (num && notes.length) printDocEl.appendChild(buildPrintAsideEl(num, notes));
    } else {
      // 1段落の分割処理がどんな構造に対しても必ず成功する保証はまだ無いため、万一失敗しても
      // 印刷全体（他の段落・注釈）が巻き添えで消えないよう、その段落だけ簡易フォールバック
      // （分割せず段落まるごと1つの<p>＋注釈は段落の後ろにまとめて出す旧方式）に切り替える。
      try {
        buildPrintParaSegments(child).forEach((el) => printDocEl.appendChild(el));
      } catch (err) {
        console.error("buildPrintParaSegments failed, falling back for this paragraph:", err, child);
        const p = document.createElement("p");
        p.className = "print-para";
        const level = Number(child.dataset.indentLevel || 0);
        const hanging = child.dataset.hanging === "1";
        if (level > 0 || hanging) {
          const base = level * INDENT_STEP_EM;
          p.style.paddingLeft = `${base + (hanging ? HANGING_EM : 0)}em`;
          p.style.textIndent = hanging ? `-${HANGING_EM}em` : "0";
        }
        Array.from(child.childNodes).forEach((n) => p.appendChild(buildPrintNode(n)));
        printDocEl.appendChild(p);
        Array.from(child.querySelectorAll(".note-anchor")).forEach((anchor) => {
          const num = anchor.querySelector(".note-num")?.textContent;
          const notes = notesByAnchor.get(anchor.dataset.anchorId) || [];
          if (num && notes.length) printDocEl.appendChild(buildPrintAsideEl(num, notes));
        });
      }
    }
  });

  // 直後にwindow.print()（またはプレビュー用のクラス切り替え）が呼ばれる前に、大量のfloat要素を
  // 書き換えた後のレイアウトを強制的に確定させる（読み取りアクセスでリフローを強制する定番の手法）。
  // これを入れずに直後printすると、印刷専用のレンダリングパスがレイアウト未確定のまま走り、
  // float要素（サイドノート側）が描画されない不具合が起きたことがあったための予防措置。
  void printDocEl.offsetHeight;
}

savePdfBtn.onclick = () => {
  try {
    buildPrintDoc();
    document.body.classList.add("print-active");
    window.print();   // Chromeではこの呼び出しはダイアログが閉じるまでブロックするので、直後にクラスを外してよい
  } finally {
    // buildPrintDoc()やwindow.print()の途中で何か例外が起きても、印刷専用の見た目のまま
    // 編集画面に固まってしまわないよう、必ずクラスを外す。
    document.body.classList.remove("print-active");
  }
};

// デバッグ用：印刷版面をネイティブの印刷ダイアログを開かずに画面上でそのままプレビューする
// （Ctrl+Alt+Pでトグル）。window.print()はOS側の印刷ダイアログを開くため中身を自動化ツールから
// 確認できない。印刷レイアウト（floatの実際の描画）を実機で調整する時はこちらを使う。
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.altKey && e.key.toLowerCase() === "p") {
    e.preventDefault();
    buildPrintDoc();
    document.body.classList.toggle("print-active");
  }
});

loadInput.onchange = (e) => {
  const file = e.target.files && e.target.files[0];
  loadInput.value = "";   // 同じファイルを続けて開き直せるようにリセット
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      applyProjectData(JSON.parse(reader.result));
      setStatus(`読み込みました：${file.name}`);
    } catch (err) {
      setStatus("読み込みに失敗しました。ファイルが壊れているか、対応していない形式です。");
    }
  };
  reader.onerror = () => setStatus("読み込みに失敗しました。");
  reader.readAsText(file);
};

// ---- 自動保存（ブラウザ内・安全網） ----
// 明示的な「保存」を忘れてタブを閉じてしまった場合に備え、変更のたびにブラウザ内へも自動保存しておく。
// あくまで安全網なので、保存に失敗しても（容量超過等）エラー表示はしない。
// 画像はdata URLとして doc.innerHTML にそのまま含まれるため、localStorageの容量上限（5MB程度）に
// 画像入りの文書だと届きやすい点に注意（.jsonファイルへの明示保存の方が本命）。
const AUTOSAVE_KEY = "sidenote-pdf-autosave-v1";

function autoSave() {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(serializeProject()));
  } catch (err) {
    // 容量超過等は無視。明示保存（.json書き出し）があるため致命的ではない。
  }
}
const autoSaveDebounced = debounce(autoSave, 800);

// ページを開いた時点で読み込める自動保存があるかどうかを判定し、「続きから再開」の有効/無効を切り替える。
// 以前は条件付きの黄色いバナーで出していたが、常時表示のツールバーボタンに統一したため、
// 「復元できる内容が無い時はボタンを押せなくする」という形でユーザーに知らせる。
// 復元対象のデータはこの関数のクロージャに保持しておき、ボタン押下時にそのまま使う。
function checkAutoSaveOnLoad() {
  let raw;
  try { raw = localStorage.getItem(AUTOSAVE_KEY); } catch (err) { raw = null; }
  let data = null;
  if (raw) {
    try { data = JSON.parse(raw); } catch (err) { data = null; }
  }
  const hasContent = !!(data && data.docHTML && data.docHTML !== '<div class="para"><br></div>');

  resumeApplyBtn.disabled = !hasContent;
  resumeApplyBtn.title = hasContent
    ? `ブラウザ内の自動保存を読み込みます（${data.title ? `「${data.title}」・` : ""}自動保存: ${data.savedAt ? new Date(data.savedAt).toLocaleString("ja-JP") : "不明な日時"}）`
    : "復元できる自動保存がありません";

  resumeApplyBtn.onclick = () => {
    if (!hasContent) return;
    try {
      applyProjectData(data);
      setStatus("自動保存された内容を復元しました。");
    } catch (err) {
      setStatus("復元に失敗しました。");
    }
  };
}
checkAutoSaveOnLoad();

// 「新しい作業」：本文・ノート・画像に加えてタイトルも空にし、自動保存も消す（＝別の案件を新規に始める）。
// 同じ案件を書き直したい時のための「文書をクリア」（タイトルは残す）とは意図が異なる。
resumeDiscardBtn.onclick = () => {
  try { localStorage.removeItem(AUTOSAVE_KEY); } catch (err) { /* noop */ }
  resetDoc();
  notesByAnchor.clear();
  titleInput.value = "";
  renumberAndLayout();
  updatePlaceholder();
  checkAutoSaveOnLoad();   // 復元対象が無くなったので「続きから再開」を無効化し直す
  setStatus("新しい作業を始めます。");
};

// ---- 範囲選択→コメント追加ポップオーバー（本文テキスト向け） ----
doc.addEventListener("mouseup", handleSelection);
doc.addEventListener("touchend", handleSelection);

function getNodePara(node) {
  const el = node.nodeType === 1 ? node : node.parentElement;
  return el ? el.closest(".para") : null;
}

function handleSelection() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  if (!doc.contains(range.commonAncestorContainer)) return;
  if (rangeOverlapsLockedAnchor(range)) return;   // 既存のロック範囲・画像ブロックをまたぐ選択には非対応
  // 複数段落にまたがる選択は「複数段落まとめてインデント」用の選択とみなし、ノート追加欄は出さない
  // （1つのノートは1段落内の一文を引用する前提のため、段落をまたぐ選択はそもそも引用として成立しない）。
  const startPara = getNodePara(range.startContainer);
  const endPara = getNodePara(range.endContainer);
  if (!startPara || !endPara || startPara !== endPara) return;
  pendingTarget = { type: "text", range: range.cloneRange() };
  openPopover(range.getBoundingClientRect());
}

// ---- 色選択（自分／共有相手／重要）----
// 直前に選んだ色をポップオーバーの初期選択にする（毎回選び直す手間を減らす）。
const colorPickerEl = document.getElementById("colorPicker");
function updateColorPickerSelection() {
  colorPickerEl.querySelectorAll(".color-swatch").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.color === lastUsedColor);
  });
}
function updateColorSwatchLabels() {
  colorPickerEl.querySelectorAll(".color-swatch").forEach((btn) => {
    btn.textContent = colorLabel(btn.dataset.color);
  });
}
colorPickerEl.querySelectorAll(".color-swatch").forEach((btn) => {
  btn.onclick = () => {
    lastUsedColor = btn.dataset.color;
    updateColorPickerSelection();
  };
});
updateColorSwatchLabels();

// ---- 「設定」（黒・青の名前）と「各種ボタンのヘルプ」のドロップダウン ----
// 黒・青の名前はこの端末の既定値としてlocalStorageにも残し、次に新規で作る文書にも引き継ぐ
// （個別の.jsonファイルを開いた場合は、そのファイルに保存されている名前が優先される＝applyProjectData側）。
const COLOR_NAMES_KEY = "sidenote-pdf-color-names-v1";
(function loadColorNamesDefault() {
  try {
    const raw = localStorage.getItem(COLOR_NAMES_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.black) colorNames.black = parsed.black;
    if (parsed && parsed.blue) colorNames.blue = parsed.blue;
  } catch (err) { /* noop */ }
})();
function saveColorNamesDefault() {
  try { localStorage.setItem(COLOR_NAMES_KEY, JSON.stringify(colorNames)); } catch (err) { /* noop */ }
}
nameBlackInput.value = colorNames.black;
nameBlueInput.value = colorNames.blue;
nameBlackInput.oninput = () => {
  colorNames.black = nameBlackInput.value.trim() || "自分";
  updateColorSwatchLabels();
  saveColorNamesDefault();
  renumberAndLayout();   // 既存ノートの表示名（色ラベル）も更新する
  autoSaveDebounced();
};
nameBlueInput.oninput = () => {
  colorNames.blue = nameBlueInput.value.trim() || "共有相手";
  updateColorSwatchLabels();
  saveColorNamesDefault();
  renumberAndLayout();
  autoSaveDebounced();
};

// サイドノートの名前表示（自分／共有相手／重要）のオンオフ。こちらも端末の個人設定としてlocalStorageへ。
const SHOW_NAMES_KEY = "sidenote-pdf-show-names-v1";
(function loadShowNamesDefault() {
  try {
    const raw = localStorage.getItem(SHOW_NAMES_KEY);
    if (raw !== null) showAuthorLabel = raw === "1";
  } catch (err) { /* noop */ }
})();
showNamesToggle.checked = showAuthorLabel;
showNamesToggle.onchange = () => {
  showAuthorLabel = showNamesToggle.checked;
  try { localStorage.setItem(SHOW_NAMES_KEY, showAuthorLabel ? "1" : "0"); } catch (err) { /* noop */ }
  renumberAndLayout();
};

// 「設定」「各種ボタンのヘルプ」は同じ開閉パターン（同じボタンをもう一度押す、または他方を開くと閉じる）。
function toggleDropdownPanel(panelEl, btnEl) {
  const opening = panelEl.hidden;
  document.querySelectorAll(".dropdown-panel").forEach((el) => { el.hidden = true; });
  closePopover();
  if (!opening) return;
  const rect = btnEl.getBoundingClientRect();
  panelEl.hidden = false;
  panelEl.style.top = `${window.scrollY + rect.bottom + 6}px`;
  panelEl.style.left = `${window.scrollX + rect.left}px`;
}
settingsBtn.onclick = () => toggleDropdownPanel(settingsPanel, settingsBtn);
helpBtn.onclick = () => toggleDropdownPanel(helpPanel, helpBtn);

function openPopover(rect) {
  settingsPanel.hidden = true;
  helpPanel.hidden = true;
  popoverInput.value = "";
  popoverEl.hidden = false;
  updateColorPickerSelection();
  updateColorSwatchLabels();
  const top = window.scrollY + rect.bottom + 6;
  const maxLeft = window.scrollX + document.documentElement.clientWidth - popoverEl.offsetWidth - 12;
  const left = Math.min(window.scrollX + rect.left, Math.max(12, maxLeft));
  popoverEl.style.top = `${top}px`;
  popoverEl.style.left = `${left}px`;
  popoverInput.focus();
}

function closePopover() {
  pendingTarget = null;
  popoverEl.hidden = true;
}

document.getElementById("notePopoverCancel").onclick = () => {
  closePopover();
  window.getSelection()?.removeAllRanges();
};

document.getElementById("notePopoverAdd").onclick = () => {
  const text = popoverInput.value.trim();
  if (!text || !pendingTarget) return;

  if (pendingTarget.type === "text") {
    addTextNote(pendingTarget.range, text, lastUsedColor);
  } else if (pendingTarget.type === "image") {
    addImageNote(pendingTarget.paraEl, text, lastUsedColor);
  } else if (pendingTarget.type === "reply") {
    addNoteToAnchor(pendingTarget.anchorId, text, lastUsedColor);
  }

  closePopover();
  window.getSelection()?.removeAllRanges();
  renumberAndLayout();
  updatePlaceholder();
};

// anchorId（一文のロック範囲、または画像）に1件コメントを積む（＝返信スレッドへの追加）。
// 新規ノート・画像ノート・既存アンカーへの返信のいずれも最終的にここを通る共通の入り口。
function addNoteToAnchor(anchorId, text, color) {
  const note = { id: "r" + replyIdSeq++, text, color: color || "black" };
  if (!notesByAnchor.has(anchorId)) notesByAnchor.set(anchorId, []);
  notesByAnchor.get(anchorId).push(note);
  return note;
}

function addTextNote(range, text, color) {
  const anchorId = "a" + anchorIdSeq++;
  const quoted = range.toString();
  // <mark>は「ハイライト」の意味を持つタグなので使わず、中立な<span>にする。
  // 番号(<sup>)は選択範囲の先頭に置く（末尾ではなく）。
  const html = `<span class="note-anchor" contenteditable="false" data-anchor-id="${anchorId}">` +
    `<sup class="note-num"></sup><span>${escapeHtml(quoted)}</span></span>`;

  // 段落の一番先頭（直前に文字が1つも無い位置）でcontenteditable="false"の要素をinsertHTMLすると、
  // Chromeがその要素を段落の外（.paraの直前の兄弟）へ押し出してしまう既知の挙動がある
  // （文の冒頭を選択して注釈を付けると、注釈が.paraから外れてPDF/MD書き出しの対象から漏れたり
  // 選択範囲より多めの文字を巻き込んだりする不具合として発現する。2026-08-16に実機で発見・特定）。
  // 回避策：直前にゼロ幅スペースを1文字だけ仮に挿し込み、「段落の先頭ちょうど」という条件を
  // 崩してからinsertHTMLする（挿入後は不要なので取り除く）。
  const paraEl = (range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer
    : range.startContainer.parentElement)?.closest(".para");
  let zwsp = null;
  if (paraEl) {
    const probe = document.createRange();
    probe.setStart(paraEl, 0);
    probe.setEnd(range.startContainer, range.startOffset);
    if (probe.toString().length === 0) {
      zwsp = document.createTextNode("​");
      paraEl.insertBefore(zwsp, paraEl.firstChild);
    }
  }

  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  // execCommand('insertHTML')経由にすると、ノート追加もブラウザのundo履歴(Ctrl+Z)に乗る
  // （insertNodeなど直接のDOM操作はundo履歴の対象外になってしまうため使わない）。
  // ※execCommandの戻り値は信用せず、実際にDOMへ挿入されたかで成否判定する（二重挿入バグの教訓）。
  document.execCommand && document.execCommand("insertHTML", false, html);
  if (zwsp) zwsp.remove();
  if (!doc.querySelector(`[data-anchor-id="${anchorId}"]`)) {
    // 本当に失敗した場合のみのフォールバック（この経路のみundo対象外）
    const anchor = document.createElement("span");
    anchor.className = "note-anchor";
    anchor.contentEditable = "false";
    anchor.dataset.anchorId = anchorId;
    const sup = document.createElement("sup");
    sup.className = "note-num";
    anchor.appendChild(sup);
    const contentSpan = document.createElement("span");
    contentSpan.appendChild(range.extractContents());
    anchor.appendChild(contentSpan);
    range.insertNode(anchor);
  }
  addNoteToAnchor(anchorId, text, color);
}

// ---- 画像ブロック（スクショ） ----
// カーソル位置の.paraを起点に execCommand ではなく直接DOM操作で挿入する。
// contenteditable内でブロック要素をカーソル位置へinsertHTMLすると、既存の.para内に
// ネストして壊れることがあるため、確実に「現在の段落の直後」に兄弟要素として差し込む方式にした。
// 代わりにこの操作自体はCtrl+Zのundo対象外になる（削除は×ボタンで行う・既知の制約）。
function getCurrentParaOrLast() {
  return getCurrentPara() || doc.querySelector(".para:last-child, .para-image:last-child") || doc.lastElementChild;
}

function buildAndInsertImageBlock(file, afterEl, onInserted) {
  const reader = new FileReader();
  reader.onload = () => {
    const paraId = "img" + imageIdSeq++;
    const wrap = buildImageParaEl(paraId, reader.result);
    if (afterEl && afterEl.parentElement === doc) afterEl.insertAdjacentElement("afterend", wrap);
    else doc.appendChild(wrap);
    // 画像が文書の一番最後に来ると、その下に続きを打つための段落が無くなり編集できなくなるため、
    // 画像の後に何も無ければ空の.paraを1つ用意しておく（クリックすれば続けて入力できる）。
    if (!wrap.nextElementSibling) {
      const trailingPara = document.createElement("div");
      trailingPara.className = "para";
      trailingPara.innerHTML = "<br>";
      wrap.insertAdjacentElement("afterend", trailingPara);
    }
    bindImageParaEvents(wrap);
    updatePlaceholder();
    renumberAndLayout();
    autoSaveDebounced();
    onInserted && onInserted(wrap);
  };
  reader.readAsDataURL(file);
}

function insertImageBlock(file) {
  buildAndInsertImageBlock(file, getCurrentParaOrLast());
}

function buildImageParaEl(paraId, dataUrl) {
  const wrap = document.createElement("div");
  wrap.className = "para para-image";
  wrap.contentEditable = "false";
  wrap.dataset.paraId = paraId;

  const inner = document.createElement("div");
  inner.className = "para-image-inner";

  const meta = document.createElement("div");
  meta.className = "para-image-meta";

  const noteBtn = document.createElement("button");
  noteBtn.type = "button";
  noteBtn.className = "para-image-note-btn";
  noteBtn.textContent = "＋ ノート";
  noteBtn.title = "この画像にコメントを追加（出典はサイドノートに記載してください）";
  meta.appendChild(noteBtn);

  // 画像そのものの削除ボタンは置かない（カーソルを画像の脇に置いてBackspaceで削除する運用にする）。
  // 「＋ノート」は操作性のため画像の上に置く（先に画像を選ばず操作できるように）。
  inner.appendChild(meta);

  const img = document.createElement("img");
  img.className = "para-image-img";
  img.src = dataUrl;
  img.alt = "スクショ";
  inner.appendChild(img);

  // 通し番号バッジも画像より上に置く（テキストの方も選択範囲の先頭に番号を置く設計なので、それに揃える）。
  const notesRow = document.createElement("div");
  notesRow.className = "para-image-notes";
  wrap.appendChild(notesRow);
  wrap.appendChild(inner);

  return wrap;
}

// applyProjectData()でのdoc.innerHTML再代入後は既存のリスナーが失われるため、
// 新規作成時・復元時のどちらからも呼べる形にしてある（冪等：何度呼んでも上書きするだけ）。
function bindImageParaEvents(wrap) {
  const noteBtn = wrap.querySelector(".para-image-note-btn");

  noteBtn.onclick = () => {
    pendingTarget = { type: "image", paraEl: wrap };
    openPopover(noteBtn.getBoundingClientRect());
  };
}

// 画像は原文のロックが無い分テキストより単純：画像自身のparaIdをそのままアンカーIDとして使う
// （画像1枚につき通し番号バッジは1つだけ。複数コメントはそのバッジの下にスレッドとして並ぶ）。
function addImageNote(paraEl, text, color) {
  addNoteToAnchor(paraEl.dataset.paraId, text, color);
  ensureImageNoteBadge(paraEl);
}

function ensureImageNoteBadge(paraEl) {
  const notesRow = paraEl.querySelector(".para-image-notes");
  if (notesRow.querySelector(".note-anchor")) return;
  const badge = document.createElement("span");
  badge.className = "note-anchor img-note-anchor";
  badge.dataset.anchorId = paraEl.dataset.paraId;
  const sup = document.createElement("sup");
  sup.className = "note-num";
  badge.appendChild(sup);
  notesRow.appendChild(badge);
}

imgInput.onchange = (e) => {
  const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith("image/"));
  imgInput.value = "";   // 同じファイルを続けて選び直せるようにリセット
  if (!files.length) return;
  // FileReaderは非同期なので、forEachで並行に読ませると完了順が入れ替わり挿入順が崩れる。
  // 1件ずつ「直前に挿入した画像の直後」へ差し込むよう直列化して、選択順を保つ。
  let afterEl = getCurrentParaOrLast();
  const insertNext = (i) => {
    if (i >= files.length) return;
    buildAndInsertImageBlock(files[i], afterEl, (wrap) => {
      afterEl = wrap;
      insertNext(i + 1);
    });
  };
  insertNext(0);
};

// Ctrl+B / Ctrl+U で選択範囲を **太字** / <u>下線</u> に囲む（ノート入力欄）
function wrapSelection(textarea, before, after) {
  const start = textarea.selectionStart, end = textarea.selectionEnd;
  const value = textarea.value;
  const selected = value.slice(start, end);
  const insertion = before + selected + after;
  textarea.focus();
  textarea.setSelectionRange(start, end);
  const inserted = document.execCommand && document.execCommand("insertText", false, insertion);
  if (!inserted) textarea.value = value.slice(0, start) + insertion + value.slice(end);
  const selStart = start + before.length;
  textarea.setSelectionRange(selStart, selStart + selected.length);
}
popoverInput.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  if (e.key === "b" || e.key === "B") { e.preventDefault(); wrapSelection(popoverInput, "**", "**"); }
  else if (e.key === "u" || e.key === "U") { e.preventDefault(); wrapSelection(popoverInput, "<u>", "</u>"); }
});

// ---- 本文(#doc)側のCtrl+B / Ctrl+U ----
// execCommand('bold'/'underline')は廃止が進んでいるコマンドでブラウザによっては何も起きないため使わない。
// ノート追加で動作確認済みのinsertHTML方式に統一し、<strong>/<u>タグを選択範囲に直接かぶせる。
function applyDocFormat(tag) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;   // 選択なしでは何もしない
  const range = sel.getRangeAt(0);
  if (!doc.contains(range.commonAncestorContainer)) return;
  if (rangeOverlapsLockedAnchor(range)) return;   // ロック範囲・画像ブロックをまたぐ場合は何もしない

  const html = `<${tag}>${escapeHtml(range.toString())}</${tag}>`;
  sel.removeAllRanges();
  sel.addRange(range);
  document.execCommand("insertHTML", false, html);
  // 注：既に太字/下線になっている範囲を選んでもう一度押しても解除（トグル）はしない。
  // 外したい場合は選択し直して手動でタグの内側だけ選び、Deleteしてから打ち直してください。
}

doc.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); insertNewParagraph(); return; }
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  if (e.key === "b" || e.key === "B") { e.preventDefault(); applyDocFormat("strong"); }
  else if (e.key === "u" || e.key === "U") { e.preventDefault(); applyDocFormat("u"); }
  // Ctrl+Zはここでは何も処理しない＝ブラウザのネイティブundoにそのまま任せる。
  // 上のノート追加/削除をexecCommand経由にしたのは、まさにこのネイティブundoの対象に含めるため。
});

// Enterで新しい.para（段落）を作る。ブラウザ標準のEnter挙動任せだとclass="para"の無い
// ただの<div>やbrになり、その行にインデントを適用できなくなるため、自前で挿入して制御する。
function insertNewParagraph() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  if (!doc.contains(range.commonAncestorContainer)) return;
  if (rangeOverlapsLockedAnchor(range)) return;

  // 挿入した.paraを一時属性で目印してすぐ拾い、カーソルをその中（brの手前＝空行の先頭）に置く。
  document.execCommand("insertHTML", false, '<div class="para" data-new-para="1"><br></div>');
  const newPara = doc.querySelector('.para[data-new-para="1"]');
  if (!newPara) return;
  newPara.removeAttribute("data-new-para");

  const r = document.createRange();
  r.setStart(newPara, 0);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
}

// ---- インデント／ぶら下げインデント（カーソルが属する.para単位で適用） ----
// 1em ≒ 全角1文字（37字組版と同じ前提）。インデント・ぶら下げとも1段階＝1文字分にする。
const INDENT_STEP_EM = 1;
const HANGING_EM = 1;

function getCurrentPara() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  let node = sel.getRangeAt(0).commonAncestorContainer;
  if (node.nodeType !== 1) node = node.parentElement;
  return node ? node.closest(".para") : null;
}

// カーソルだけ（範囲選択なし）なら今まで通りその1段落だけ、複数段落にまたがる範囲選択なら
// かかっている段落を全部まとめて返す（例：⑴〜⑷を選択してまとめてインデント、に対応するため）。
function getTargetParas() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return [];
  if (sel.isCollapsed) {
    const para = getCurrentPara();
    return para ? [para] : [];
  }
  const range = sel.getRangeAt(0);
  if (!doc.contains(range.commonAncestorContainer)) return [];
  return Array.from(doc.querySelectorAll(".para")).filter((p) => range.intersectsNode(p));
}

function applyParaStyle(para) {
  const level = Number(para.dataset.indentLevel || 0);
  const hanging = para.dataset.hanging === "1";
  const base = level * INDENT_STEP_EM;
  para.style.paddingLeft = `${base + (hanging ? HANGING_EM : 0)}em`;
  para.style.textIndent = hanging ? `-${HANGING_EM}em` : "0";
  autoSaveDebounced();   // style/data属性の直接操作はinputイベントが飛ばないため、ここで明示的に呼ぶ
}

function indentPara(delta) {
  const paras = getTargetParas().filter((p) => !p.classList.contains("para-image"));   // 画像ブロックは対象外
  paras.forEach((para) => {
    const level = Math.max(0, Number(para.dataset.indentLevel || 0) + delta);
    para.dataset.indentLevel = String(level);
    applyParaStyle(para);
  });
}

function toggleHanging() {
  const paras = getTargetParas().filter((p) => !p.classList.contains("para-image"));
  if (!paras.length) return;
  // 複数段落で状態がバラバラだと「トグル」の意味が定まらないため、先頭の段落を基準に全体を揃える
  // （先頭が未適用ならまとめてON、適用済みならまとめてOFF）。
  const turnOn = paras[0].dataset.hanging !== "1";
  paras.forEach((para) => {
    para.dataset.hanging = turnOn ? "1" : "0";
    applyParaStyle(para);
  });
}

document.getElementById("indentInc").onclick = () => indentPara(1);
document.getElementById("indentDec").onclick = () => indentPara(-1);
document.getElementById("hangingBtn").onclick = () => toggleHanging();

// ---- コメント削除（スレッドの1件だけ削除／最後の1件を消したらロックも解除） ----
function removeNoteFromAnchor(anchor, anchorId, noteId) {
  const remaining = (notesByAnchor.get(anchorId) || []).filter((n) => n.id !== noteId);

  if (remaining.length > 0) {
    notesByAnchor.set(anchorId, remaining);
  } else {
    notesByAnchor.delete(anchorId);
    // スレッドが空になった＝ロック解除。画像はバッジを外すだけ（画像本体は残す）、
    // テキストは引用していた原文をそのまま書き戻して編集可能に戻す。
    if (anchor.classList.contains("img-note-anchor")) {
      anchor.remove();
    } else {
      const contentSpan = anchor.querySelector("span");
      const text = contentSpan ? contentSpan.textContent : "";
      const range = document.createRange();
      range.selectNode(anchor);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      const replaced = document.execCommand && document.execCommand("insertText", false, text);   // これもCtrl+Z対象にするため
      if (!replaced) anchor.replaceWith(document.createTextNode(text));
    }
  }

  renumberAndLayout();
  updatePlaceholder();
  autoSaveDebounced();
}

// ---- 通し番号を振り直して、右側にサイドノートを配置する ----
// 貼り付け（doc.addEventListener("paste", ...)）でexecCommand('insertHTML')に複数行分の
// <div class="para">...</div>をまとめて渡すと、カーソルが既存の（多くは最初の空の）.paraの中に
// あった場合、Chromeがそれらを兄弟として展開せず、既存の.paraの中に入れ子にしてしまうことがある
// （2026-08-17、実際のユーザーファイルで発覚：入れ子になった結果、印刷・MD書き出しが段落・注釈を
// 直下しか見ない設計のため、注釈が一つも出力されなくなっていた）。
// 入れ子の.paraを見つけたら、外側の.paraをその中身（＝本来並ぶはずだった複数の.para）で
// 置き換えて1階層引き上げる。renumberAndLayout()は貼り付け後のinputイベント・.json読み込み後
// （applyProjectData）を含め編集の度に呼ばれるため、ここに置くことで自己修復として機能する。
function flattenNestedParas(root) {
  let changed = true;
  while (changed) {
    changed = false;
    Array.from(root.children).forEach((el) => {
      if (!el.classList || !el.classList.contains("para")) return;
      const hasNestedPara = Array.from(el.children).some((c) => c.classList && c.classList.contains("para"));
      if (!hasNestedPara) return;
      const frag = document.createDocumentFragment();
      Array.from(el.childNodes).forEach((n) => frag.appendChild(n));
      el.replaceWith(frag);
      changed = true;
    });
  }
}

// anchorはdoc内に実体として存在するので、querySelectorAllの結果＝そのまま文書内の出現順になる
// （テキストのノート・画像のノートを問わず、DOM上の登場順で自動的に混ざる）。
function renumberAndLayout() {
  flattenNestedParas(doc);
  const anchors = Array.from(doc.querySelectorAll(".note-anchor"));
  // 画像ブロックがBackspace等でDOMごと消えた場合、notesByAnchorにそのIDだけ残ってしまうので、
  // 実際に文書内に存在するIDだけ残す（ゴミの蓄積・書き出し時の混入を防ぐ）。
  const liveAnchorIds = new Set(anchors.map((a) => a.dataset.anchorId));
  Array.from(notesByAnchor.keys()).forEach((id) => {
    if (!liveAnchorIds.has(id)) notesByAnchor.delete(id);
  });

  const ordered = anchors.map((anchor, i) => {
    const num = i + 1;
    const supEl = anchor.querySelector(".note-num");
    if (supEl) supEl.textContent = String(num);
    const anchorId = anchor.dataset.anchorId;
    return { num, mark: anchor, anchorId, notes: notesByAnchor.get(anchorId) || [] };
  });
  updateImageNoteButtons();
  layoutSidenotes(ordered);
}

// コメントが既に付いている画像は、右のサイドノートにある「＋ 返信」で追記できるので、
// 画像側の「＋ ノート」ボタンは（紛らわしいので）隠す。コメントが0件に戻れば再表示する。
function updateImageNoteButtons() {
  doc.querySelectorAll(".para-image").forEach((el) => {
    const hasNotes = (notesByAnchor.get(el.dataset.paraId) || []).length > 0;
    const btn = el.querySelector(".para-image-note-btn");
    if (btn) btn.hidden = hasNotes;
  });
}

// 画像のサイドノートは、バッジ（.img-note-anchor）ではなく画像自体の上端に高さを揃える方が分かりやすいため、
// 位置決めだけは画像要素のrectを使う（通し番号・スレッドの紐付けはバッジ＝mark側のまま変えない）。
function getPositionRect(mark) {
  if (mark.classList.contains("img-note-anchor")) {
    const img = mark.closest(".para-image")?.querySelector(".para-image-img");
    if (img) return img.getBoundingClientRect();
  }
  return mark.getBoundingClientRect();
}

function layoutSidenotes(ordered) {
  docRightEl.innerHTML = "";
  if (ordered.length === 0) return;
  const originTop = doc.getBoundingClientRect().top;
  const GAP = 20;   // 罫線ではなく余白で個々のノートを区切るため、番号+枠線を使っていた頃より広めに取る
  let prevBottom = -Infinity;

  ordered.forEach((n) => {
    const card = document.createElement("div");
    card.className = "sidenote-card";

    const numEl = document.createElement("span");
    numEl.className = "sidenote-num";
    numEl.textContent = String(n.num);
    card.appendChild(numEl);

    // 1つの通し番号の下に、自分・共有相手それぞれのコメントを色分けして積む（返信スレッド）。
    n.notes.forEach((note) => {
      const entry = document.createElement("div");
      entry.className = "sidenote-entry";

      const textEl = document.createElement("span");
      textEl.className = "sidenote-text";
      textEl.style.color = AUTHOR_COLOR_HEX[note.color] || AUTHOR_COLOR_HEX.black;
      // 名前表示は「設定」のオンオフに従う（色分けだけで足りる場合は非表示にできる）。
      // md書き出し側は常に名前を含める＝別扱い（色の情報がそのまま持ち込めないため）。
      const namePrefix = showAuthorLabel ? `<strong>${escapeHtml(colorLabel(note.color))}：</strong>` : "";
      textEl.innerHTML = namePrefix + formatNoteText(note.text);

      const rmBtn = document.createElement("button");
      rmBtn.className = "sidenote-rm";
      rmBtn.type = "button";
      rmBtn.innerHTML = ICON_X;
      rmBtn.title = n.notes.length > 1 ? "このコメントを削除" : "このコメントを削除（ロックも解除）";
      rmBtn.onclick = () => removeNoteFromAnchor(n.mark, n.anchorId, note.id);

      entry.appendChild(textEl);
      entry.appendChild(rmBtn);
      card.appendChild(entry);
    });

    const replyBtn = document.createElement("button");
    replyBtn.type = "button";
    replyBtn.className = "sidenote-reply-btn";
    replyBtn.textContent = "＋ 返信";
    replyBtn.title = "この一文にコメントを追加する";
    replyBtn.onclick = () => {
      pendingTarget = { type: "reply", anchorId: n.anchorId };
      openPopover(replyBtn.getBoundingClientRect());
    };
    card.appendChild(replyBtn);

    docRightEl.appendChild(card);

    const r = getPositionRect(n.mark);
    let top = r.top - originTop;
    if (top < prevBottom + GAP) top = prevBottom + GAP;
    card.style.top = `${top}px`;
    prevBottom = top + card.getBoundingClientRect().height;
  });
}

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => renumberAndLayout(), 150);
});
