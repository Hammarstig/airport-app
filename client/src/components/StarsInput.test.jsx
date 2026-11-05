import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { StarsInput } from './StarsInput.jsx';

function Harness({ half = true, onChange = () => {} }) {
  const [v, setV] = useState(null);
  return (
    <StarsInput
      label="Betyg"
      half={half}
      value={v}
      onChange={(x) => {
        setV(x);
        onChange(x);
      }}
    />
  );
}

describe('StarsInput', () => {
  it('är en grupp med 10 radioknappar i halvsteg', () => {
    render(<Harness />);
    expect(screen.getByRole('group', { name: 'Betyg' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(10);
    expect(screen.getByRole('radio', { name: '3,5 av 5' })).toBeInTheDocument();
  });

  it('väljer betyg och rensar vid nytt klick på samma', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const four = screen.getByRole('radio', { name: '4,0 av 5' });
    await userEvent.click(four);
    expect(onChange).toHaveBeenLastCalledWith(4);
    expect(four).toBeChecked();
    await userEvent.click(four);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('har hela steg utan halvor', () => {
    render(<Harness half={false} />);
    expect(screen.getAllByRole('radio')).toHaveLength(5);
  });
});
