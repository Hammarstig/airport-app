import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Podium } from './Podium.jsx';
import { Change } from './RankRow.jsx';

const u = (n) => ({ username: n, displayName: n });

describe('Podium', () => {
  it('placerar efter position och visar delad rank', () => {
    const { container } = render(
      <MemoryRouter>
        <Podium
          items={[
            { rank: 1, user: u('a'), value: 9 },
            { rank: 2, user: u('b'), value: 5 },
            { rank: 2, user: u('c'), value: 5 }
          ]}
          unit="flygplatser"
          meUsername="c"
        />
      </MemoryRouter>
    );
    const places = container.querySelectorAll('.podium__place');
    expect([...places].map((p) => p.className)).toEqual([
      'podium__place podium__place--1',
      'podium__place podium__place--2',
      'podium__place podium__place--3 podium__place--me'
    ]);
    expect(screen.getAllByLabelText('Plats 2')).toHaveLength(2);
  });
  it('visas inte med färre än tre', () => {
    const { container } = render(<Podium items={[{ rank: 1, user: u('a'), value: 1 }]} unit="x" />);
    expect(container.innerHTML).toBe('');
  });
  it('förändringspilar', () => {
    render(<Change change={2} />);
    expect(screen.getByLabelText('Upp 2 placeringar')).toBeInTheDocument();
  });
});
