const archiver = require('archiver');
const Submission = require('../models/Submission');
const localDriver = require('./storage/local.driver');
const storage = require('./storage');
const logger = require('../utils/logger');
const sheetService = require('./sheet.service');
const cardService = require('./card.service');
const { definition, isFileField, isDataBearing, isPrintable } = require('../constants/fieldTypes');

/**
 * Turns one answer into a single printable cell.
 *
 * Composite and multi-select answers are flattened, because a print operator
 * merging into a card template needs one column per value - not JSON.
 */
function flattenValue(field, value) {
  if (value === undefined || value === null) return '';

  switch (field.type) {
    case 'address': {
      if (typeof value !== 'object') return String(value);
      return [value.line1, value.line2, value.city, value.state, value.pincode]
        .filter(Boolean)
        .join(', ');
    }
    case 'date': {
      const d = new Date(value);
      // dd/mm/yyyy - what an Indian print operator expects to see on a card.
      return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-IN');
    }
    default:
      if (Array.isArray(value)) return value.join('; ');
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
  }
}

/**
 * Builds the column layout for a print export.
 *
 * Derived from the SNAPSHOT of whichever submission we have, not the live
 * form: the export must describe the data as it was collected. Address is
 * split into its parts, since a card template usually positions them
 * separately.
 */
function buildColumns(snapshot) {
  const columns = [
    { key: '__loginId', header: 'User ID' },
    { key: '__name', header: 'Name' },
    { key: '__category', header: 'Category' },
    { key: '__department', header: 'Department' },
  ];

  for (const field of snapshot) {
    if (!isDataBearing(field.type) || !isPrintable(field.type)) continue;

    if (field.type === 'address') {
      columns.push(
        { key: `${field.key}__line1`, header: `${field.label} Line 1` },
        { key: `${field.key}__line2`, header: `${field.label} Line 2` },
        { key: `${field.key}__city`, header: `${field.label} City` },
        { key: `${field.key}__state`, header: `${field.label} State` },
        { key: `${field.key}__pincode`, header: `${field.label} PIN` }
      );
      continue;
    }

    if (isFileField(field.type)) {
      // The cell holds the filename inside the ZIP, so the operator can link
      // the row to the image without guessing.
      columns.push({ key: field.key, header: `${field.label} File` });
      continue;
    }

    columns.push({ key: field.key, header: field.label });
  }

  return columns;
}

/**
 * The filename stem for one person's exported files.
 * Strips anything that could escape the folder or upset a filesystem.
 */
function safeName(value) {
  return String(value).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60);
}

/** Safe, predictable filename for an exported asset. */
function assetFilename(submission, field, file) {
  const base = safeName(submission.userLoginId || String(submission._id));

  const ext =
    {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'application/pdf': '.pdf',
    }[file.mimetype] || '.bin';

  const def = definition(field.type);
  // Photograph is the common case and gets the bare id; other file fields are
  // suffixed so two uploads for one person cannot collide.
  const suffix = def?.exportFolder === 'photos' ? '' : `_${field.key}`;
  return `${base}${suffix}${ext}`;
}

/** Builds the row objects for the data file. */
function buildRows(submissions, columns) {
  return submissions.map((submission) => {
    const values = submission.data || {};
    const files =
      submission.files instanceof Map
        ? Object.fromEntries(submission.files)
        : submission.files || {};

    const row = {
      __loginId: submission.userLoginId || '',
      __name: submission.userName || '',
      __category: submission.orgCategory?.name || '',
      __department: submission.department?.name || '',
    };

    for (const field of submission.formSnapshot || []) {
      if (isFileField(field.type)) {
        const file = files[field.key];
        row[field.key] = file ? assetFilename(submission, field, file) : '';
        continue;
      }
      if (field.type === 'address') {
        const addr = typeof values[field.key] === 'object' ? values[field.key] : {};
        row[`${field.key}__line1`] = addr.line1 || '';
        row[`${field.key}__line2`] = addr.line2 || '';
        row[`${field.key}__city`] = addr.city || '';
        row[`${field.key}__state`] = addr.state || '';
        row[`${field.key}__pincode`] = addr.pincode || '';
        continue;
      }
      row[field.key] = flattenValue(field, values[field.key]);
    }

    // Any column with no matching answer must still exist, or the CSV rows
    // would be ragged.
    for (const col of columns) {
      if (row[col.key] === undefined) row[col.key] = '';
    }

    return row;
  });
}

/**
 * Streams a complete print package as a ZIP.
 *
 * Streamed rather than buffered: a lot of 5,000 cards with photographs is
 * comfortably over a gigabyte, and holding that in memory would take the
 * server down. The archive is piped straight to the response.
 */
async function streamPrintPackage(res, { lot, submissions, folderName, cardDesign = null }) {
  const snapshot = submissions.find((s) => s.formSnapshot?.length)?.formSnapshot || [];
  const columns = buildColumns(snapshot);
  const rows = buildRows(submissions, columns);

  const archive = archiver('zip', { zlib: { level: 6 } });

  archive.on('warning', (err) => {
    // ENOENT here means one asset was missing; the rest of the package is
    // still valid, so log it rather than aborting the whole download.
    if (err.code === 'ENOENT') logger.warn('Export: missing asset', err.message);
    else throw err;
  });
  archive.on('error', (err) => {
    logger.error('Export archive failed', err);
    res.destroy(err);
  });

  archive.pipe(res);

  // 1. the data file
  archive.append(sheetService.buildCsv(columns, rows), { name: `${folderName}/data.csv` });

  // 2. an Excel copy, which is what most operators actually open
  const xlsx = await sheetService.buildXlsx(columns, rows, 'Print Data');
  archive.append(Buffer.from(xlsx), { name: `${folderName}/data.xlsx` });

  // 3. a manifest, so a package can be checked without opening the data
  archive.append(
    JSON.stringify(
      {
        lot: lot?.lotNumber || null,
        form: lot?.formTitle || null,
        records: submissions.length,
        generatedAt: new Date().toISOString(),
        columns: columns.map((c) => c.header),
        assetFolders: ['photos', 'signatures', 'documents'],
        cardDesign: cardDesign
          ? {
              name: cardDesign.name,
              sizeMm: `${cardDesign.widthMm} x ${cardDesign.heightMm}`,
              dpi: cardDesign.dpi,
              pixels: `${cardDesign.pixelSize.width} x ${cardDesign.pixelSize.height}`,
              faces: cardDesign.hasBack ? ['front', 'back'] : ['front'],
            }
          : null,
      },
      null,
      2
    ),
    { name: `${folderName}/manifest.json` }
  );

  // 4. every asset, foldered by kind
  let missing = 0;
  for (const submission of submissions) {
    const files =
      submission.files instanceof Map
        ? Object.fromEntries(submission.files)
        : submission.files || {};

    for (const field of submission.formSnapshot || []) {
      if (!isFileField(field.type)) continue;
      const file = files[field.key];
      if (!file?.publicId) continue;

      const def = definition(field.type);
      const folder = def?.exportFolder || 'documents';
      const name = `${folderName}/${folder}/${assetFilename(submission, field, file)}`;

      if (file.provider === 'cloudinary' || storage.activeDriver() === 'cloudinary') {
        // Cloudinary assets are not on our disk; the manifest carries a signed
        // URL instead of the bytes.
        archive.append(storage.signedUrl(file.publicId, { expiresInSeconds: 86400 }) || '', {
          name: `${name}.url.txt`,
        });
        continue;
      }

      try {
        // eslint-disable-next-line no-await-in-loop
        const buffer = await localDriver.read(file.publicId);
        archive.append(buffer, { name });
      } catch {
        missing += 1;
        logger.warn('Export: could not read asset', file.publicId);
      }
    }
  }

  /*
   * 5. the finished cards
   *
   * Rendered one at a time and appended as they are produced rather than
   * collected first: a lot can hold thousands of records, and holding every
   * composited PNG in memory before writing any of them would exhaust the
   * process on exactly the large lots that matter most.
   */
  let cardsRendered = 0;
  let cardsFailed = 0;
  if (cardDesign) {
    for (const submission of submissions) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const { front, back } = await cardService.renderCard(cardDesign, submission);
        const base = safeName(submission.userLoginId || String(submission._id));
        archive.append(front, { name: `${folderName}/cards/${base}-front.png` });
        if (back) archive.append(back, { name: `${folderName}/cards/${base}-back.png` });
        cardsRendered += 1;
      } catch (err) {
        cardsFailed += 1;
        logger.error('Export: card render failed', {
          submission: String(submission._id),
          message: err.message,
        });
      }
    }

    if (cardsFailed > 0) {
      archive.append(
        `${cardsFailed} card(s) could not be rendered and are absent from the cards folder.\n` +
          'The data and photographs for those records are still included.\n',
        { name: `${folderName}/CARDS_NOT_RENDERED.txt` }
      );
    }
  }

  if (missing > 0) {
    archive.append(
      `${missing} asset(s) referenced in data.csv could not be read at export time.\n` +
        'Check the submissions listed with a blank file column.\n',
      { name: `${folderName}/MISSING_ASSETS.txt` }
    );
  }

  await archive.finalize();
  return {
    records: submissions.length,
    columns: columns.length,
    missing,
    cardsRendered,
    cardsFailed,
  };
}

/** Loads the submissions for a lot, ready to export. */
function loadForLot(lot) {
  return Submission.find({ _id: { $in: lot.submissions } })
    .populate('orgCategory', 'name')
    .populate('department', 'name')
    .sort({ userLoginId: 1, userName: 1 });
}

module.exports = {
  buildColumns,
  buildRows,
  flattenValue,
  assetFilename,
  safeName,
  streamPrintPackage,
  loadForLot,
};
