/**
 * Sökutdrag med markerade träffar, renderat som React-noder (ingen innerHTML).
 * Använder snippetParts från API:t; som reserv delas den escapade snippet-strängen på <mark>.
 */
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'" };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39|#x27);/g, (m) => ENTITIES[m]);

export function toParts(snippet = '') {
  return snippet
    .split(/(<mark>.*?<\/mark>)/g)
    .filter(Boolean)
    .map((seg) => {
      const m = seg.match(/^<mark>(.*)<\/mark>$/);
      return { text: decode(m ? m[1] : seg), mark: !!m };
    });
}

export function Snippet({ parts, snippet, className }) {
  const list = parts || toParts(snippet);
  return (
    <p className={className}>
      {list.map((p, i) => (p.mark ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
    </p>
  );
}
