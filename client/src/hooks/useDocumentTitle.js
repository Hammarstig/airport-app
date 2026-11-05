import { useEffect } from 'react';

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} - Gatelog` : 'Gatelog';
  }, [title]);
}
