import { useState } from 'react';
import { AlertCircle, Check, Copy, Download } from 'lucide-react';
import Modal from './ui/Modal.jsx';
import Button from './ui/Button.jsx';

/**
 * One-time credential handoff.
 *
 * Passwords are stored only as bcrypt hashes, so this dialog is the single
 * moment they exist in readable form. Everything here is built around that:
 * copy, download, and an explicit warning that closing loses them.
 */
export default function CredentialsDialog({
  open,
  onClose,
  title = 'Account created',
  organizationName,
  credentials = [],
  loginUrl = `${window.location.origin}/login`,
}) {
  const [copied, setCopied] = useState(false);

  const asText = credentials
    .map((c) =>
      [
        c.name ? `Name: ${c.name}` : null,
        c.loginId ? `User ID: ${c.loginId}` : null,
        c.email ? `Email: ${c.email}` : null,
        `Temporary password: ${c.temporaryPassword || c.password}`,
      ]
        .filter(Boolean)
        .join('\n')
    )
    .join('\n\n');

  const header = [
    'MR Print World - Print Data Platform',
    organizationName ? `Organisation: ${organizationName}` : null,
    `Sign-in: ${loginUrl}`,
    '',
  ]
    .filter(Boolean)
    .join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${header}${asText}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const downloadCsv = () => {
    const escape = (v) => {
      const s = String(v ?? '');
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = [
      ['Name', 'User ID', 'Email', 'Temporary Password', 'Category', 'Department'],
      ...credentials.map((c) => [
        c.name || '',
        c.loginId || '',
        c.email || '',
        c.temporaryPassword || c.password || '',
        c.category || '',
        c.department || '',
      ]),
    ];
    // BOM keeps Excel from mangling non-ASCII names.
    const csv = `﻿${rows.map((r) => r.map(escape).join(',')).join('\r\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'credentials.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const many = credentials.length > 1;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={
        many
          ? `${credentials.length} accounts were created. Save these credentials now.`
          : 'Hand these credentials to the user now.'
      }
      size={many ? 'lg' : 'md'}
      closeOnOverlay={false}
      footer={
        <Button onClick={onClose}>Done</Button>
      }
    >
      <div className="flex items-start gap-2.5 rounded-lg border border-warning-200 bg-warning-50 p-3">
        <AlertCircle size={16} className="mt-0.5 shrink-0 text-warning-600" aria-hidden="true" />
        <p className="text-sm leading-relaxed text-warning-800">
          {many ? (
            <>
              These passwords are shown <strong>once</strong>. They are stored only as hashes and
              cannot be retrieved later — if lost, you will need to reset them individually.
            </>
          ) : (
            <>
              This password is shown <strong>once</strong>. It is stored only as a hash and cannot
              be retrieved later — if lost, you will need to reset it.
            </>
          )}
        </p>
      </div>

      <div className="mt-4 flex gap-2">
        <Button variant="secondary" size="sm" icon={copied ? Check : Copy} onClick={copy}>
          {copied ? 'Copied' : 'Copy all'}
        </Button>
        <Button variant="secondary" size="sm" icon={Download} onClick={downloadCsv}>
          Download CSV
        </Button>
      </div>

      <div className="mt-4 max-h-80 overflow-y-auto rounded-lg border border-ink-200">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-ink-50">
            <tr className="border-b border-ink-200">
              <th className="px-3 py-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
                Name
              </th>
              <th className="px-3 py-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
                User ID
              </th>
              <th className="px-3 py-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
                Temporary password
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200">
            {credentials.map((c, i) => (
              <tr key={c.loginId || c.email || i}>
                <td className="px-3 py-2 text-ink-800">{c.name || '—'}</td>
                <td className="px-3 py-2 font-mono text-xs text-ink-700">
                  {c.loginId || c.email || '—'}
                </td>
                <td className="px-3 py-2 font-mono text-xs font-semibold text-brand-700 select-all">
                  {c.temporaryPassword || c.password}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-ink-500">
        Everyone here must set their own password the first time they sign in, so the temporary one
        stops working immediately after.
      </p>
    </Modal>
  );
}
