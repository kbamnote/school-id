/**
 * Global serialisation plugin.
 *
 * Every model exposes `id` instead of `_id` and drops `__v`. Registering this
 * once means a new model can never accidentally ship raw `_id` to the client
 * and break the frontend contract - which is exactly what happened with the
 * Plan model before this existed.
 *
 * Schemas that declare their own `toJSON.transform` keep it; this only fills
 * in the default.
 */
function serializePlugin(schema) {
  const existing = schema.get('toJSON') || {};
  if (existing.transform) return;

  schema.set('toJSON', {
    ...existing,
    virtuals: existing.virtuals !== undefined ? existing.virtuals : true,
    transform(doc, ret) {
      /**
       * Only map when there is an `_id` to map.
       *
       * Subdocuments declared with `_id: false` often carry their own string
       * `id` (card design elements, for one). Assigning unconditionally
       * overwrote those with undefined, which broke every consumer that keyed
       * off them - silently, because the field still existed.
       */
      if (ret._id !== undefined) {
        ret.id = ret._id;
        delete ret._id;
      }
      delete ret.__v;
      return ret;
    },
  });
}

module.exports = serializePlugin;
