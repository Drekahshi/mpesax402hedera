const CODE_STYLE =
  'background:rgba(16,185,129,0.15);padding:1px 5px;border-radius:4px;font-size:11.5px;font-family:var(--font-mono),monospace;color:#86efac';

const TOKEN_TERMS = [
  'yBOB', 'YTOKEN', 'YGOLD', 'YToken', 'YGold', 'WETH', 'sETH', 'wETH',
  'NVR', 'GAMI', 'CENTS', 'ETH', 'USDT', 'USDC', 'BOB',
];

const KEY_TERMS = [
  'APY', 'APR', 'TVL', 'RAG', 'DID', 'DAO', 'NFT', 'DeFi', 'x402', 'M-Pesa',
  'Ethereum & Hedera', 'vault', 'yield', 'liquidity',
];

const TERMS = [...TOKEN_TERMS, ...KEY_TERMS];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlight(text: string): string {
  let html = escapeHtml(text);

  html = html.replace(/`([^`]+)`/g, (_, code: string) => `<code style="${CODE_STYLE}">${code}</code>`);

  html = html.replace(/\*\*([^*]+)\*\*/g, (_, strong: string) => `<strong>${strong}</strong>`);

  html = html.replace(/(\b\d[\d,]*(?:\.\d+)?%)(?![\w])/g, '<strong>$1</strong>');

  html = html.replace(/(\$\s?\d[\d,]*(?:\.\d+)?)/g, (_, amount: string) => `<strong>${amount}</strong>`);

  for (const term of TERMS) {
    html = html.replace(
      new RegExp(`(?<![\\w&;])${escapeRegExp(term)}(?![\\w])`, 'g'),
      (m: string) => `<strong>${m}</strong>`
    );
  }

  return html.replace(/\n/g, '<br/>');
}

export function formatChat(text: string): string {
  return highlight(text);
}