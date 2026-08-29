/**
 * Reads an uploaded card design and proposes elements for it.
 *
 * Everything produced here is a SUGGESTION. The distinction OCR cannot make
 * is whether a piece of text is a per-person value or fixed on every card -
 * "Muskan Raj" and "Authorized Signature" look identical to it. Guessing
 * wrong in the confident direction would print one person's name on the whole
 * batch, so every element comes back flagged `suggested` for a human to
 * confirm in the designer.
 *
 * Runs in the browser: the artwork is already here at upload time, and
 * keeping OCR off the server avoids a heavy dependency on a small dyno.
 */

/** Words that indicate a printed LABEL rather than somebody's data. */
const LABEL_HINTS = [
  'name',
  'father',
  'mother',
  'guardian',
  'blood',
  'group',
  'dob',
  'birth',
  'date',
  'address',
  'phone',
  'mobile',
  'contact',
  'email',
  'id',
  'no',
  'number',
  'roll',
  'admission',
  'employee',
  'emp',
  'code',
  'class',
  'section',
  'designation',
  'department',
  'valid',
  'issue',
  'expiry',
];

/**
 * Text that is almost certainly fixed on every card.
 * Being wrong here is cheap - the admin flips it to a field in one click -
 * whereas the reverse mistake reaches the printer.
 */
const STATIC_HINTS = [
  'authorized',
  'authorised',
  'signature',
  'terms',
  'condition',
  'property of',
  'if found',
  'return to',
  'www.',
  'http',
  '.com',
  '.in',
  '.org',
  'valid upto',
  'principal',
  'director',
  'issued by',
  'not transferable',
];

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Similarity on word overlap - enough to tie "Blood Group:" to `blood_group`. */
function similarity(a, b) {
  const A = new Set(norm(a).split(' ').filter(Boolean));
  const B = new Set(norm(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;

  let shared = 0;
  for (const word of A) if (B.has(word)) shared += 1;
  return shared / Math.max(A.size, B.size);
}

/** Averages the ink colour inside a box, ignoring the lighter background. */
function sampleTextColour(imageData, box, width) {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  const x0 = Math.max(0, Math.floor(box.x0));
  const x1 = Math.min(width - 1, Math.ceil(box.x1));
  const y0 = Math.max(0, Math.floor(box.y0));
  const y1 = Math.min(imageData.height - 1, Math.ceil(box.y1));

  const pixels = [];
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const i = (y * width + x) * 4;
      const lum = 0.299 * imageData.data[i] + 0.587 * imageData.data[i + 1] + 0.114 * imageData.data[i + 2];
      pixels.push({ lum, r: imageData.data[i], g: imageData.data[i + 1], b: imageData.data[i + 2] });
    }
  }
  if (!pixels.length) return '#111111';

  // The darkest third is the glyphs; the rest is whatever they sit on.
  pixels.sort((p, q) => p.lum - q.lum);
  const ink = pixels.slice(0, Math.max(1, Math.floor(pixels.length / 3)));
  for (const p of ink) {
    r += p.r;
    g += p.g;
    b += p.b;
    count += 1;
  }

  const hex = (n) => Math.round(n / count).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/**
 * Finds the photograph box.
 *
 * Scanning every candidate rectangle for a "quiet" area finds the largest
 * patch of blank card, not the photo well. Instead this grows connected
 * regions that differ from the card's background but carry no detail of their
 * own - which is exactly what an empty photo well is - then keeps the one
 * that is rectangular and portrait-shaped.
 *
 * The header band passes the first two tests and is rejected by the third:
 * it is wide and short, not portrait.
 *
 * Returns percentages, or null when nothing convincing is present.
 */
function detectPhotoBox(imageData, width, height) {
  const STEP = 6;
  const cols = Math.floor(width / STEP);
  const rows = Math.floor(height / STEP);
  const data = imageData.data;

  const at = (px, py) => {
    const i = (Math.min(width - 1, px) + Math.min(height - 1, py) * width) * 4;
    return { r: data[i], g: data[i + 1], b: data[i + 2] };
  };
  const lumAt = (px, py) => {
    const c = at(px, py);
    return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
  };

  /* Background, sampled away from the header band. */
  const samples = [
    at(3, Math.floor(height * 0.55)),
    at(width - 4, Math.floor(height * 0.55)),
    at(3, height - 4),
    at(width - 4, height - 4),
  ];
  const bg = {
    r: samples.reduce((s, c) => s + c.r, 0) / samples.length,
    g: samples.reduce((s, c) => s + c.g, 0) / samples.length,
    b: samples.reduce((s, c) => s + c.b, 0) / samples.length,
  };

  /*
   * A cell qualifies when it differs from the background yet holds no detail.
   * Text differs too, so busy cells are excluded - otherwise every printed
   * line joins the region it sits in.
   */
  const mask = new Uint8Array(cols * rows);
  for (let cy = 0; cy < rows - 1; cy += 1) {
    for (let cx = 0; cx < cols - 1; cx += 1) {
      const x = cx * STEP;
      const y = cy * STEP;
      const c = at(x, y);
      const delta = Math.abs(c.r - bg.r) + Math.abs(c.g - bg.g) + Math.abs(c.b - bg.b);
      const here = lumAt(x, y);
      const detail = Math.abs(here - lumAt(x + STEP, y)) + Math.abs(here - lumAt(x, y + STEP));
      mask[cy * cols + cx] = delta > 14 && detail < 30 ? 1 : 0;
    }
  }

  /* Grow regions, iteratively so a large well cannot overflow the stack. */
  const seen = new Uint8Array(cols * rows);
  let best = null;

  for (let cy = 0; cy < rows; cy += 1) {
    for (let cx = 0; cx < cols; cx += 1) {
      const start = cy * cols + cx;
      if (!mask[start] || seen[start]) continue;

      let x0 = cx;
      let x1 = cx;
      let y0 = cy;
      let y1 = cy;
      let count = 0;

      const stack = [start];
      seen[start] = 1;

      while (stack.length) {
        const idx = stack.pop();
        const px = idx % cols;
        const py = (idx - px) / cols;
        count += 1;
        if (px < x0) x0 = px;
        if (px > x1) x1 = px;
        if (py < y0) y0 = py;
        if (py > y1) y1 = py;

        const neighbours = [
          px > 0 ? idx - 1 : -1,
          px < cols - 1 ? idx + 1 : -1,
          py > 0 ? idx - cols : -1,
          py < rows - 1 ? idx + cols : -1,
        ];
        for (const n of neighbours) {
          if (n >= 0 && mask[n] && !seen[n]) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }

      const w = x1 - x0 + 1;
      const h = y1 - y0 + 1;
      const aspect = w / h;

      // Portrait, a real fraction of the card, and actually filling its box.
      const fillRatio = count / (w * h);
      const widthPct = (w * STEP * 100) / width;
      const heightPct = (h * STEP * 100) / height;

      if (
        aspect > 0.5 &&
        aspect < 1.1 &&
        fillRatio > 0.75 &&
        widthPct > 12 &&
        widthPct < 70 &&
        heightPct > 10 &&
        heightPct < 55
      ) {
        const area = w * h;
        if (!best || area > best.area) best = { area, x0, y0, w, h };
      }
    }
  }

  if (!best) return null;
  return {
    x: (best.x0 * STEP * 100) / width,
    y: (best.y0 * STEP * 100) / height,
    width: (best.w * STEP * 100) / width,
    height: (best.h * STEP * 100) / height,
  };
}

/** Groups OCR words into lines that sit on the same baseline. */
function groupIntoLines(words) {
  const lines = [];
  for (const word of words) {
    const mid = (word.bbox.y0 + word.bbox.y1) / 2;
    const height = word.bbox.y1 - word.bbox.y0;

    const line = lines.find(
      (l) => Math.abs(l.mid - mid) < height * 0.6 && Math.abs(l.height - height) < height * 0.5
    );
    if (line) {
      line.words.push(word);
      line.mid = (line.mid + mid) / 2;
    } else {
      lines.push({ mid, height, words: [word] });
    }
  }

  return lines.map((line) => {
    const words = [...line.words].sort((a, b) => a.bbox.x0 - b.bbox.x0);
    return {
      text: words.map((w) => w.text).join(' ').trim(),
      confidence: words.reduce((s, w) => s + w.confidence, 0) / words.length,
      bbox: {
        x0: Math.min(...words.map((w) => w.bbox.x0)),
        y0: Math.min(...words.map((w) => w.bbox.y0)),
        x1: Math.max(...words.map((w) => w.bbox.x1)),
        y1: Math.max(...words.map((w) => w.bbox.y1)),
      },
    };
  });
}

/**
 * Splits "Blood Group: O+" into its label and its value halves.
 *
 * Colon only. A hyphen is far more often part of the value than a separator -
 * "Class X-B" and "ADM-4521" both split in the wrong place otherwise, and the
 * label half then ends up in the printed prefix.
 */
function splitLabelled(line) {
  const match = line.text.match(/^([^:]{2,28}):\s*(.+)$/);
  if (!match) return null;
  const label = match[1].trim();
  const value = match[2].trim();
  if (!label || !value) return null;
  return { label, value };
}

function guessField(text, fields) {
  let best = null;
  for (const field of fields) {
    if (field.type === 'heading') continue;
    const score = Math.max(similarity(text, field.label), similarity(text, field.key));
    if (score > 0.34 && (!best || score > best.score)) best = { field, score };
  }
  return best;
}

const newId = () => `el_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

/**
 * Analyses an artwork file and returns proposed elements.
 *
 * @param file   the uploaded image
 * @param fields bindable form fields, from the designer
 * @param onProgress 0..1 while OCR runs
 */
export default async function detectFields(file, fields = [], onProgress = () => {}) {
  // Loaded on demand - this is a few megabytes and only matters on upload.
  const { createWorker } = await import('tesseract.js');

  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, width, height);

  onProgress(0.05);

  const worker = await createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress(0.1 + m.progress * 0.8);
    },
  });

  let lines = [];
  try {
    const { data } = await worker.recognize(canvas);
    const words = (data.words || []).filter((w) => w.confidence > 55 && w.text.trim().length > 1);
    lines = groupIntoLines(words);
  } finally {
    await worker.terminate();
  }

  onProgress(0.92);

  const pct = {
    x: (v) => (v * 100) / width,
    y: (v) => (v * 100) / height,
  };

  const elements = [];
  const used = new Set();

  for (const line of lines) {
    const { bbox } = line;
    const boxW = pct.x(bbox.x1 - bbox.x0);
    const boxH = pct.y(bbox.y1 - bbox.y0);

    // Ignore specks and anything spanning the whole card - usually a border.
    if (boxW < 4 || boxH < 1.2 || boxW > 96) continue;

    const colour = sampleTextColour(imageData, bbox, width);
    const fontSize = Math.max(1.5, boxH * 0.82);
    const centre = pct.x(bbox.x0) + boxW / 2;
    const align = centre > 42 && centre < 58 ? 'center' : centre > 62 ? 'right' : 'left';

    const base = {
      id: newId(),
      face: 'front',
      x: Math.round(pct.x(bbox.x0) * 10) / 10,
      y: Math.round(pct.y(bbox.y0) * 10) / 10,
      width: Math.round(boxW * 10) / 10,
      height: Math.round(Math.max(boxH * 1.35, 3) * 10) / 10,
      z: 2,
      suggested: true,
      style: {
        fontSize: Math.round(fontSize * 10) / 10,
        fontFamily: 'Helvetica',
        fontWeight: boxH > 5 ? 'bold' : 'normal',
        color: colour,
        align,
        verticalAlign: 'middle',
        lineHeight: 1.2,
        transform: 'none',
        hideIfEmpty: true,
      },
      detectedText: line.text,
      confidence: Math.round(line.confidence),
    };

    const lower = line.text.toLowerCase();

    // 1. Obviously fixed wording.
    if (STATIC_HINTS.some((h) => lower.includes(h))) {
      elements.push({ ...base, type: 'static', text: line.text });
      continue;
    }

    // 2. "Label: value" - bind the value, and keep the label as printed text.
    const split = splitLabelled(line);
    if (split) {
      const guess = guessField(split.label, fields);
      if (guess && !used.has(guess.field.key)) {
        used.add(guess.field.key);
        elements.push({
          ...base,
          type: 'field',
          fieldKey: guess.field.key,
          fieldType: guess.field.type,
          style: { ...base.style, prefix: `${split.label}: ` },
        });
        continue;
      }
    }

    // 3. A bare label with its value elsewhere on the card.
    const asLabel = guessField(line.text, fields);
    const looksLikeLabel = LABEL_HINTS.some((h) => lower.includes(h));

    if (asLabel && !used.has(asLabel.field.key) && (looksLikeLabel || asLabel.score > 0.6)) {
      used.add(asLabel.field.key);
      elements.push({
        ...base,
        type: 'field',
        fieldKey: asLabel.field.key,
        fieldType: asLabel.field.type,
      });
      continue;
    }

    // 4. Anything else is a value with no label to identify it. Offered as
    //    static so a wrong guess is visible rather than printed on everyone.
    elements.push({ ...base, type: 'static', text: line.text });
  }

  // The photo box, if the artwork has an obvious well for one.
  const photoField = fields.find((f) => f.type === 'photo');
  const box = detectPhotoBox(imageData, width, height);
  if (photoField && box && box.width > 8 && box.height > 8) {
    elements.unshift({
      id: newId(),
      type: 'field',
      face: 'front',
      fieldKey: photoField.key,
      fieldType: 'photo',
      x: Math.round(box.x * 10) / 10,
      y: Math.round(box.y * 10) / 10,
      width: Math.round(box.width * 10) / 10,
      height: Math.round(box.height * 10) / 10,
      z: 1,
      suggested: true,
      style: { objectFit: 'cover', radius: 0, hideIfEmpty: true },
      detectedText: 'photo area',
      confidence: 70,
    });
  }

  onProgress(1);

  return {
    elements,
    summary: {
      linesRead: lines.length,
      bound: elements.filter((e) => e.type === 'field').length,
      static: elements.filter((e) => e.type === 'static').length,
      photoFound: Boolean(box && photoField),
    },
  };
}
