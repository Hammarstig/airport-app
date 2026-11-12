import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FollowButton } from './FollowButton.jsx';
import { mockFetch, renderApp } from '../test/utils.jsx';

const login = () => {
  localStorage.setItem('gatelog.token', 'aaa.bbb.ccc');
  localStorage.setItem('gatelog.user', JSON.stringify({ username: 'me' }));
};

describe('FollowButton', () => {
  it('följer och avföljer', async () => {
    login();
    mockFetch({
      '/api/me': { username: 'me' },
      '/api/users/anna/follow': (u, i) => ({ following: i.method === 'POST', followers: 1 })
    });
    renderApp(<FollowButton username="anna" />);
    const b = screen.getByRole('button', { name: 'Följ' });
    await userEvent.click(b);
    expect(await screen.findByRole('button', { name: 'Följer' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Följer' }));
    expect(await screen.findByRole('button', { name: 'Följ' })).toBeInTheDocument();
  });

  it('privat profil ger förfrågan', async () => {
    login();
    mockFetch({
      '/api/me': { username: 'me' },
      '/api/users/sara/follow': { following: false, requested: true, followers: 0 }
    });
    renderApp(<FollowButton username="sara" />);
    await userEvent.click(screen.getByRole('button', { name: 'Följ' }));
    expect(await screen.findByRole('button', { name: 'Förfrågan skickad' })).toBeInTheDocument();
  });

  it('visas inte för en själv', () => {
    login();
    mockFetch({ '/api/me': { username: 'me' } });
    renderApp(<FollowButton username="me" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
