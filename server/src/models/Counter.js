const mongoose = require('mongoose');

/**
 * Atomic sequence generator.
 *
 * Used for anything that must never collide or reuse a number: user IDs
 * (STU00001), lot numbers (LOT-2026-000124), job numbers. A read-then-write
 * counter would race under concurrent bulk imports; findOneAndUpdate with
 * $inc is a single atomic document operation, so it cannot.
 */
const counterSchema = new mongoose.Schema(
  {
    // Scope key, e.g. `${organizationId}:category:${categoryId}` or `lot:2026`
    key: { type: String, required: true, unique: true, index: true },
    seq: { type: Number, default: 0 },
  },
  { timestamps: true }
);

counterSchema.statics.next = async function next(key, step = 1) {
  const doc = await this.findOneAndUpdate(
    { key },
    { $inc: { seq: step } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
  return doc.seq;
};

/** Reserves a contiguous block in one round trip - used by bulk import. */
counterSchema.statics.nextBlock = async function nextBlock(key, count) {
  if (count <= 0) return [];
  const doc = await this.findOneAndUpdate(
    { key },
    { $inc: { seq: count } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
  const end = doc.seq;
  const start = end - count + 1;
  return Array.from({ length: count }, (_, i) => start + i);
};

module.exports = mongoose.model('Counter', counterSchema);
