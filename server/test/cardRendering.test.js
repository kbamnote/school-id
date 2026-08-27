const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const card = require('../src/services/card.service');

/**
 * Card value rules.
 *
 * `card.service.resolveText` (print) and the browser's `resolveValue.js`
 * (live preview) must agree exactly - a student approves what the preview
 * draws and receives what the server renders. These cases pin the shared
 * behaviour, and the last test checks the two files have not drifted apart.
 */
describe('card value resolution', () => {
  const el = (over = {}) => ({ type: 'field', fieldKey: 'v', style: {}, ...over });

  test('a missing value resolves to empty, not "undefined"', () => {
    assert.equal(card.resolveText(el(), {}), '');
    assert.equal(card.resolveText(el(), { v: null }), '');
    assert.equal(card.resolveText(el(), { v: '' }), '');
  });

  test('prefix and suffix wrap the value', () => {
    const element = el({ style: { prefix: 'Blood group: ', suffix: ' (verified)' } });
    assert.equal(card.resolveText(element, { v: 'O+' }), 'Blood group: O+ (verified)');
  });

  test('an empty value produces no orphaned prefix', () => {
    // Otherwise a card prints a bare "Blood group:" label with nothing after it.
    const element = el({ style: { prefix: 'Blood group: ' } });
    assert.equal(card.resolveText(element, { v: '' }), '');
  });

  test('dates render as dd/mm/yyyy', () => {
    const element = el({ fieldType: 'date' });
    assert.equal(card.resolveText(element, { v: '2011-03-09T00:00:00.000Z' }), '09/03/2011');
  });

  test('an unparseable date falls back to the raw value', () => {
    const element = el({ fieldType: 'date' });
    assert.equal(card.resolveText(element, { v: 'not a date' }), 'not a date');
  });

  test('an address flattens onto one line', () => {
    const value = {
      line1: '14 Nehru Road',
      line2: '',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411001',
    };
    assert.equal(
      card.resolveText(el(), { v: value }),
      '14 Nehru Road, Pune, Maharashtra, 411001'
    );
  });

  test('multiple choices join with commas', () => {
    assert.equal(card.resolveText(el(), { v: ['A', 'B'] }), 'A, B');
  });

  test('transforms apply after the prefix is added', () => {
    const element = el({ style: { prefix: 'name: ', transform: 'uppercase' } });
    assert.equal(card.resolveText(element, { v: 'priya' }), 'NAME: PRIYA');
  });

  test('static text ignores the record entirely', () => {
    const element = { type: 'static', text: 'Authorized Signature', style: {} };
    assert.equal(card.resolveText(element, { v: 'anything' }), 'Authorized Signature');
  });

  test('a field element with no bound key resolves to empty', () => {
    assert.equal(card.resolveText({ type: 'field', style: {} }, { v: 'x' }), '');
  });
});

describe('card layout maths', () => {
  test('photographs and signatures are drawn as images, not text', () => {
    assert.equal(card.isImageElement({ type: 'field', fieldType: 'photo' }), true);
    assert.equal(card.isImageElement({ type: 'field', fieldType: 'signature' }), true);
    assert.equal(card.isImageElement({ type: 'field', fieldType: 'short_text' }), false);
    assert.equal(card.isImageElement({ type: 'static' }), false);
  });

  test('text wraps to the box rather than overflowing the card', () => {
    const lines = card.wrapText('Priya Sharma Chaudhary', 120, 20);
    assert.ok(lines.length > 1, 'a long name must wrap');
    assert.equal(lines.join(' '), 'Priya Sharma Chaudhary');
  });

  test('a single word longer than the line is hard-split', () => {
    const lines = card.wrapText('Supercalifragilisticexpialidocious', 60, 20);
    assert.ok(lines.length > 1);
    assert.ok(lines.every((l) => l.length > 0));
  });

  test('SVG-unsafe characters in a value cannot break the overlay', () => {
    // A name containing < or & would otherwise produce invalid SVG and fail
    // the whole render for that person.
    const escaped = card.escapeXml('Tom & Jerry <script>');
    assert.ok(!escaped.includes('<'));
    assert.ok(!escaped.includes('&&'));
    assert.match(escaped, /&amp;/);
    assert.match(escaped, /&lt;/);
  });
});

describe('preview parity', () => {
  test('the browser resolver mirrors the print resolver', () => {
    const clientFile = path.resolve(
      __dirname,
      '../../client/src/features/cardDesigner/resolveValue.js'
    );
    assert.ok(fs.existsSync(clientFile), 'the browser resolver must exist');

    const client = fs.readFileSync(clientFile, 'utf8');
    const server = fs.readFileSync(
      path.resolve(__dirname, '../src/services/card.service.js'),
      'utf8'
    );

    /*
     * Both files must keep the same branches. This will not catch every
     * possible divergence, but it fails loudly if someone adds a rule to one
     * side only - which is the realistic way these two drift.
     */
    for (const marker of [
      "element.type === 'static'",
      "element.fieldType === 'date'",
      'toLocaleDateString',
      'raw.pincode',
      'prefix',
      'suffix',
      "transform === 'uppercase'",
    ]) {
      assert.ok(client.includes(marker), `browser resolver is missing: ${marker}`);
      assert.ok(server.includes(marker), `print resolver is missing: ${marker}`);
    }
  });
});
