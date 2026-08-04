// GenAI Finance - Apple-styled Stock & Sentiment Analysis Application

const form = document.getElementById('ticker-form');
const results = document.getElementById('results');
const btnLoadAapl = document.getElementById('btn-load-aapl-packet');
const togglePacketBtn = document.getElementById('toggle-packet-btn');
const packetDrawer = document.getElementById('packet-drawer');
const packetToggleIcon = document.getElementById('packet-toggle-icon');
const packetTextarea = document.getElementById('packet-json');

// Pre-loaded AAPL Earnings Research Packet JSON
const SAMPLE_AAPL_PACKET = {
  "meta": {
    "symbol": "AAPL",
    "reporting_company": "Apple",
    "report_date": "2026-04-30",
    "assembled_at": "2026-08-04 17:02:51 CEST"
  },
  "context": {
    "assembled_text": "=== PRIMARY SOURCE: COMPANY STATEMENTS ===\nGood afternoon, welcome to the Apple Q2 fiscal year 2026 earnings conference call. My name is Suhasini Chandramouli, Director of Investor Relations. Speaking first today is Apple CEO Tim Cook. John Ternus will be joining after that for a brief set of remarks, and he'll be followed by CFO Kevan Parekh. After that, we'll open the call to questions from analysts.\n\nKey highlights from call:\n- Total revenue: $111.2 billion, up 17% YoY, a March quarter record.\n- iPhone revenue: $57 billion, up 22% YoY.\n- Services revenue: $31 billion, up 16% YoY.\n- EPS: $2.01, up 22% YoY.\n- Installed base over 2.5 billion active devices.\n- Tim Cook transitioning to Executive Chairman on Sept 1st, John Ternus appointed next CEO.\n- Board authorized additional $100 billion share repurchase program and 4% dividend increase to $0.27/share.\n- Memory costs expected to drive increasing impact beyond June quarter.\n- Mac mini and Mac Studio supply constrained due to surging AI demand.",
    "length_chars": 51211
  },
  "sentiment": {
    "overall": {
      "positive_count": 59,
      "negative_count": 12,
      "total_words": 8748,
      "density": 1.5861,
      "label": "positive"
    },
    "by_role": [
      { "role_group": "Analyst", "sentiment_density": 0.0007 },
      { "role_group": "Company", "sentiment_density": 0.019 }
    ],
    "most_positive_speakers": [
      { "speaker": "Kevan Parekh", "sentiment_density": 0.0255 },
      { "speaker": "Tim Cook", "sentiment_density": 0.0253 },
      { "speaker": "John Ternus", "sentiment_density": 0.0191 }
    ],
    "most_negative_speakers": [
      { "speaker": "Ben Reitzes", "sentiment_density": -0.0126 },
      { "speaker": "Wamsi Mohan", "sentiment_density": -0.0042 },
      { "speaker": "Suhasini Chandramouli", "sentiment_density": -0.0012 }
    ]
  },
  "extraction": {
    "companies_mentioned": ["Apple", "Google", "TSMC", "Morgan Stanley", "Goldman Sachs", "Bank of America", "UBS", "Wells Fargo"],
    "executives": [
      { "name": "Tim Cook", "role": "CEO" },
      { "name": "John Ternus", "role": "Incoming CEO / Executive" },
      { "name": "Kevan Parekh", "role": "CFO" },
      { "name": "Suhasini Chandramouli", "role": "Director of IR" }
    ],
    "products_and_segments": ["iPhone 17 family", "MacBook Neo", "Mac mini", "Mac Studio", "iPad Air", "AirPods Max 2", "Apple Intelligence", "Services"],
    "forward_looking_statements": [
      { "speaker": "Suhasini Chandramouli", "statement": "some of the information you'll hear during our discussion today will consist of forward-looking statements..." },
      { "speaker": "Tim Cook", "statement": "I very much look forward to stepping into the role of Executive Chairman on September 1st" },
      { "speaker": "John Ternus", "statement": "I want you to know that is something Kevan and I intend to continue when I transition into the role in September" },
      { "speaker": "Kevan Parekh", "statement": "We expect our June quarter total company revenue to grow by 14%-17% year-over-year..." },
      { "speaker": "Tim Cook", "statement": "we expect significantly higher memory costs... memory costs will drive an increasing impact on our business" }
    ]
  }
};

// UI Listeners
if (togglePacketBtn && packetDrawer) {
  togglePacketBtn.addEventListener('click', () => {
    const isHidden = packetDrawer.classList.contains('hidden');
    if (isHidden) {
      packetDrawer.classList.remove('hidden');
      packetToggleIcon.textContent = '▾';
    } else {
      packetDrawer.classList.add('hidden');
      packetToggleIcon.textContent = '▸';
    }
  });
}

if (btnLoadAapl) {
  btnLoadAapl.addEventListener('click', () => {
    document.getElementById('ticker').value = 'AAPL';
    packetTextarea.value = JSON.stringify(SAMPLE_AAPL_PACKET, null, 2);
    if (packetDrawer && packetDrawer.classList.contains('hidden')) {
      packetDrawer.classList.remove('hidden');
      if (packetToggleIcon) packetToggleIcon.textContent = '▾';
    }
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const ticker = document.getElementById('ticker').value.trim().toUpperCase();
  const twelveDataKey = document.getElementById('twelvedata-key').value.trim() || import.meta.env.VITE_TWELVEDATA_API_KEY || '';
  const openRouterKey = document.getElementById('openrouter-key').value.trim() || import.meta.env.VITE_OPENROUTER_API_KEY || '';
  const packetRaw = packetTextarea ? packetTextarea.value.trim() : '';

  if (!twelveDataKey) {
    results.innerHTML = `
      <div class="error-state">
        <svg class="error-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <div>
          <strong>Twelve Data Key Required</strong>
          <p style="margin: 4px 0 0;">Enter your Twelve Data key above or set <code>VITE_TWELVEDATA_API_KEY</code> in your environment.</p>
        </div>
      </div>
    `;
    return;
  }
  if (!openRouterKey) {
    results.innerHTML = `
      <div class="error-state">
        <svg class="error-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <div>
          <strong>OpenRouter Key Required</strong>
          <p style="margin: 4px 0 0;">Enter your OpenRouter API key above or set <code>VITE_OPENROUTER_API_KEY</code> in your environment.</p>
        </div>
      </div>
    `;
    return;
  }

  let parsedPacket = null;
  if (packetRaw) {
    try {
      parsedPacket = JSON.parse(packetRaw);
    } catch (e) {
      results.innerHTML = `
        <div class="error-state">
          <svg class="error-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
          </svg>
          <div>
            <strong>Invalid Packet JSON</strong>
            <p style="margin: 4px 0 0;">The research packet JSON provided is not valid JSON. Please fix it or clear the textarea.</p>
          </div>
        </div>
      `;
      return;
    }
  }

  results.innerHTML = `
    <div class="loading-state">
      <div class="apple-spinner"></div>
      <p class="loading-text">Fetching market data for ${ticker} & running GenAI equity sentiment analysis...</p>
    </div>
  `;

  try {
    const priceData = await fetchPriceData(ticker, twelveDataKey);
    const analysisNote = await generateMarketAndSentimentAnalysis(ticker, priceData, parsedPacket, openRouterKey);
    renderResults(ticker, priceData, analysisNote, parsedPacket);
  } catch (err) {
    results.innerHTML = `
      <div class="error-state">
        <svg class="error-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <div>
          <strong>Analysis Failed</strong>
          <p style="margin: 4px 0 0;">${err.message}</p>
        </div>
      </div>
    `;
  }
});

async function fetchPriceData(ticker, apiKey) {
  const url = `https://api.twelvedata.com/time_series?symbol=${ticker}&interval=1day&outputsize=90&apikey=${apiKey}`;
  const response = await fetch(url);

  const body = await response.text();
  let raw;
  try {
    raw = JSON.parse(body);
  } catch {
    throw new Error(body.trim() || 'Price fetch failed');
  }

  if (raw && raw.status === 'error') throw new Error(raw.message || 'Price fetch failed');
  if (!response.ok) throw new Error('Price fetch failed');

  const values = raw.values ?? [];
  if (!values.length) throw new Error(`No price data returned for ${ticker}`);

  return values
    .map((b) => ({
      date: b.datetime,
      open: Number(b.open),
      high: Number(b.high),
      low: Number(b.low),
      close: Number(b.close),
      volume: Number(b.volume)
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function generateMarketAndSentimentAnalysis(ticker, priceData, packet, apiKey) {
  const first = priceData[0];
  const latest = priceData[priceData.length - 1];
  const pctChange = ((latest.close - first.close) / first.close) * 100;

  // Compute 20-day Simple Moving Average
  const last20 = priceData.slice(-20);
  const sma20 = last20.reduce((acc, curr) => acc + curr.close, 0) / last20.length;
  const isAboveSma = latest.close > sma20;

  const priceSummary = `${ticker} daily price action from ${first.date} to ${latest.date}: ` +
    `Opened period at $${first.close.toFixed(2)}, latest close $${latest.close.toFixed(2)} (${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(2)}%). ` +
    `20-day SMA is $${sma20.toFixed(2)} (price is ${isAboveSma ? 'above' : 'below'} 20-day SMA).`;

  let systemPrompt = `You are an equity research assistant preparing professional notes for a senior financial analyst.
Maintain a objective, precise tone. Bullet points and short clean paragraphs.

Rules:
1. Attribute claims to specific sections when packet data is provided (context, sentiment, or extraction).
2. Distinguish what management asserted from what analysts questioned.
3. Quote forward-looking statements verbatim when cited.
4. Do not provide direct investment advice or buy/sell calls.
5. Be concise and structured using clear section headings.`;

  let userPrompt = '';

  if (packet) {
    userPrompt = `Attached below is the structured research packet for ${ticker}.
Please draft a one page research note covering:
1. What management emphasized in this quarter (products, segments, figures).
2. How the tone reads (management vs analysts sentiment, most positive/negative speakers).
3. Specific forward-looking statements management made (quoted verbatim).
4. Where context/news supports or complicates the company's account.
5. What to look for next quarter to confirm or reject this reading.

Combine this with the recent market price performance: ${priceSummary}

RESEARCH PACKET:
${JSON.stringify(packet, null, 2)}`;
  } else {
    userPrompt = `Draft a comprehensive Market Analysis and Sentiment Note for ${ticker}.
Market Data: ${priceSummary}

Cover:
1. **Market Performance & Technical Sentiment**: Trend, price momentum, and moving average stance.
2. **Sentiment Analysis**: Evaluate overall market sentiment and potential driver catalysts for ${ticker}.
3. **Key Strategic Focus & Outlook**: What to watch for in upcoming earnings reports to confirm momentum.`;
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      max_tokens: 2500,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    // Fallback model retry if primary is busy or rate limited
    const fallbackResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.3-70b-instruct',
        max_tokens: 2500,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });

    if (!fallbackResponse.ok) {
      throw new Error(`OpenRouter call failed. ${await readOpenRouterError(response)}`);
    }
    const fbData = await fallbackResponse.json();
    return fbData.choices?.[0]?.message?.content ?? 'No response returned.';
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? 'No response returned.';
}

async function readOpenRouterError(response) {
  let message = '';
  try {
    const body = await response.json();
    const err = body.error ?? body;
    message = err.message || '';
    const provider = err.metadata?.provider_name;
    const raw = err.metadata?.raw;
    if (provider) message += ` [provider: ${provider}]`;
    if (raw) message += ` ${typeof raw === 'string' ? raw : JSON.stringify(raw)}`;
  } catch {
    // non-json error body
  }
  const hint = {
    401: 'Your OpenRouter API key is invalid',
    402: 'OpenRouter account is out of credits',
    429: 'Rate limit reached, please retry'
  }[response.status];
  return [`(HTTP ${response.status})`, hint, message].filter(Boolean).join(' ');
}

function renderResults(ticker, priceData, noteText, packet) {
  const latest = priceData[priceData.length - 1];
  const first = priceData[0];
  const pctChange = ((latest.close - first.close) / first.close) * 100;
  const isPositive = pctChange >= 0;
  const changeColor = isPositive ? '#34c759' : '#ff3b30';

  let packetMetricsHtml = '';
  if (packet && packet.sentiment) {
    const s = packet.sentiment;
    const pos = s.most_positive_speakers || [];
    const neg = s.most_negative_speakers || [];

    packetMetricsHtml = `
      <div class="sentiment-metrics-card">
        <div class="sentiment-metrics-header">
          <h4 class="sentiment-metrics-title">Earnings Call Sentiment Dashboard</h4>
          <span class="ticker-tag" style="background: rgba(52, 199, 89, 0.12); color: #248a3d;">
            Overall: ${s.overall?.label?.toUpperCase() || 'POSITIVE'}
          </span>
        </div>
        <div class="sentiment-grid">
          <div class="sentiment-stat-box">
            <div class="sentiment-stat-label">Sentiment Density</div>
            <div class="sentiment-stat-value">${s.overall?.density || '1.58'}%</div>
            <div class="sentiment-stat-sub">${s.overall?.positive_count || 59} pos / ${s.overall?.negative_count || 12} neg words</div>
          </div>
          <div class="sentiment-stat-box">
            <div class="sentiment-stat-label">Most Positive Speakers</div>
            <div class="speaker-chips">
              ${pos.map(sp => `<span class="speaker-chip positive">▲ ${sp.speaker} (${(sp.sentiment_density * 100).toFixed(2)}%)</span>`).join('')}
            </div>
          </div>
          <div class="sentiment-stat-box">
            <div class="sentiment-stat-label">Most Critical Analysts</div>
            <div class="speaker-chips">
              ${neg.map(sp => `<span class="speaker-chip negative">▼ ${sp.speaker} (${(sp.sentiment_density * 100).toFixed(2)}%)</span>`).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Convert basic markdown formatting into clean HTML elements
  const formattedNote = formatMarkdownToAppleHtml(noteText);

  results.innerHTML = `
    <div class="results-header">
      <div class="ticker-badge">
        <h2 class="ticker-symbol">${ticker}</h2>
        <span class="ticker-tag">US Equity</span>
      </div>
      <div class="price-card">
        <div class="price-label">Latest Close (${latest.date})</div>
        <div class="price-value">$${latest.close.toFixed(2)}</div>
        <div class="price-date" style="color: ${changeColor}; font-weight: 600;">
          ${isPositive ? '+' : ''}${pctChange.toFixed(2)}% over period
        </div>
      </div>
    </div>

    ${packetMetricsHtml}

    <div class="research-note-container">
      <h3 class="research-title">Market Analysis & Sentiment Research</h3>
      <div class="analysis-body">
        ${formattedNote}
      </div>
    </div>
  `;
}

function formatMarkdownToAppleHtml(text) {
  if (!text) return '<p>No analysis generated.</p>';

  let html = text
    // Replace markdown quotes with apple quote callouts
    .replace(/^>\s*(.+)$/gm, '<blockquote class="quote-callout">$1</blockquote>')
    // Headings
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h3>$1</h3>')
    .replace(/^# (.*$)/gim, '<h3>$1</h3>')
    // Bold & italic
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Lists
    .replace(/^\s*[-*]\s+(.*)$/gim, '<li>$1</li>');

  // Wrap contiguous <li> tags in <ul>
  html = html.replace(/(<li>[\s\S]*?<\/li>)/gi, (match) => `<ul>${match}</ul>`);

  // Split double newlines into paragraphs if not already in block tags
  const paragraphs = html.split(/\n\n+/);
  return paragraphs
    .map(p => {
      const trimmed = p.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('<h') || trimmed.startsWith('<ul') || trimmed.startsWith('<blockquote')) {
        return trimmed;
      }
      return `<p>${trimmed}</p>`;
    })
    .join('');
}
