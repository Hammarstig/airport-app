import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Combobox } from './Combobox.jsx';

const DATA = {
  sto: [
    { iata: 'ARN', name: 'Arlanda' },
    { iata: 'BMA', name: 'Bromma' }
  ],
  kas: [{ iata: 'CPH', name: 'Kastrup' }],
  hea: [{ iata: 'LHR', name: 'Heathrow' }]
};

function Harness({ onSelect = () => {}, delay = 0 }) {
  const [v, setV] = useState(null);
  const fetcher = (q) => new Promise((r) => setTimeout(() => r(DATA[q.slice(0, 3).toLowerCase()] || []), delay));
  return (
    <Combobox
      label="Flygplats"
      value={v}
      onSelect={(x) => {
        setV(x);
        onSelect(x);
      }}
      fetcher={fetcher}
      itemKey={(a) => a.iata}
      itemText={(a) => `${a.iata} - ${a.name}`}
      renderItem={(a) => a.name}
    />
  );
}

describe('Combobox', () => {
  it('visar förslag och väljer med pil + Enter', async () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    const input = screen.getByRole('combobox', { name: 'Flygplats' });
    await userEvent.type(input, 'sto');
    await screen.findByRole('option', { name: 'Arlanda' });
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(onSelect).toHaveBeenLastCalledWith(DATA.sto[1]);
    expect(input).toHaveValue('BMA - Bromma');
  });

  it('BUG-03: redigering efter val tömmer inte fältet', async () => {
    render(<Harness />);
    const input = screen.getByRole('combobox', { name: 'Flygplats' });
    await userEvent.type(input, 'sto');
    await screen.findByRole('option', { name: 'Arlanda' });
    await userEvent.keyboard('{Enter}');
    expect(input).toHaveValue('ARN - Arlanda');
    await userEvent.type(input, '{Backspace}');
    expect(input).toHaveValue('ARN - Arland');
  });

  it('BUG-04: Enter direkt efter ny inmatning väljer inte en gammal träff', async () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} delay={300} />);
    const input = screen.getByRole('combobox', { name: 'Flygplats' });
    await userEvent.type(input, 'kas');
    await screen.findByRole('option', { name: 'Kastrup' }, { timeout: 2000 });
    await userEvent.keyboard('{Escape}');
    await userEvent.clear(input);
    await userEvent.type(input, 'hea{Enter}');
    expect(onSelect).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('option', { name: 'Heathrow' })).toBeInTheDocument(), {
      timeout: 2000
    });
  });
});
