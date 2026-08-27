/**
 * One response envelope for the whole API so the client never has to guess
 * where the payload lives.
 *
 *   { success: true, message, data, meta }
 *   { success: false, message, code, details }
 */
function ok(res, data = null, message = 'OK', meta) {
  const body = { success: true, message, data };
  if (meta) body.meta = meta;
  return res.status(200).json(body);
}

function created(res, data = null, message = 'Created') {
  return res.status(201).json({ success: true, message, data });
}

function noContent(res) {
  return res.status(204).send();
}

/** Paginated list helper - `meta` shape is identical across every list endpoint. */
function paginated(res, items, { page, limit, total }, message = 'OK', extraMeta = null) {
  return res.status(200).json({
    success: true,
    message,
    data: items,
    meta: {
      page,
      limit,
      total,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
      // Endpoint-specific counts (unread notifications, and the like) ride
      // alongside the paging numbers rather than needing a second request.
      ...(extraMeta || {}),
    },
  });
}

module.exports = { ok, created, noContent, paginated };
