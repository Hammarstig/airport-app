import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Snippet, toParts } from './Snippet.jsx';

describe('Snippet', () => {
  it('delar escapad HTML på <mark> utan att tolka annan HTML', () => {
    expect(toParts('a &lt;b&gt; <mark>wifi</mark> c')).toEqual([
      { text: 'a <b> ', mark: false },
      { text: 'wifi', mark: true },
      { text: ' c', mark: false }
    ]);
    const { container } = render(<Snippet snippet={'&lt;img src=x onerror=alert(1)&gt; <mark>kö</mark>'} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('mark').textContent).toBe('kö');
  });
});
