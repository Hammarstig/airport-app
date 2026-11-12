import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportDialog } from './ReportDialog.jsx';
import { mockFetch, renderApp } from '../test/utils.jsx';

describe('ReportDialog', () => {
  it('kräver skäl och skickar rapporten', async () => {
    const calls = mockFetch({ '/api/reports': { id: 1, status: 'open' } });
    const onClose = vi.fn();
    renderApp(<ReportDialog type="comment" target={5} onClose={onClose} />);
    const send = screen.getByRole('button', { name: 'Skicka rapport' });
    expect(send).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: /Trakasserier/ }));
    await userEvent.type(screen.getByLabelText('Kommentar (valfritt)'), 'Elakt');
    await userEvent.click(send);
    const post = calls.find((c) => c.url === '/api/reports');
    expect(JSON.parse(post.init.body)).toEqual({ type: 'comment', target: 5, reason: 'harassment', note: 'Elakt' });
    expect(onClose).toHaveBeenCalled();
  });

  it('stängs med Escape', async () => {
    mockFetch({});
    const onClose = vi.fn();
    renderApp(<ReportDialog type="user" target="anna" onClose={onClose} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
