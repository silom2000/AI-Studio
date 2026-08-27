// ============ UNIFIED SEARCH HELPER (TAVILY, FIRECRAWL, DDG) ============
require('dotenv').config();
const axios = require('axios');

/**
 * Clean API keys by removing optional 'Bearer ' prefix and whitespace
 */
function getCleanApiKey(keyName) {
    const rawKey = process.env[keyName];
    if (!rawKey) return null;
    return rawKey.replace(/^Bearer\s+/i, '').trim();
}

/**
 * 1. Tavily Search API
 * Built specifically for LLMs and AI agents. Returns structured results and summaries.
 */
async function searchTavily(query, apiKey) {
    console.log(`[SearchHelper: Tavily] Searching for: "${query}"`);
    try {
        const response = await axios.post('https://api.tavily.com/search', {
            api_key: apiKey,
            query: query,
            search_depth: "basic",
            include_answer: true,
            max_results: 6
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000
        });

        if (response.data && response.data.results && response.data.results.length > 0) {
            let output = '';
            if (response.data.answer) {
                output += `Tavily Summary: ${response.data.answer}\n\n`;
            }
            const snippets = response.data.results.map((r, idx) => {
                const content = r.content || r.snippet || '';
                return `[${idx + 1}] ${r.title || 'Result'}\nURL: ${r.url || ''}\n${content}`;
            }).join('\n\n');
            output += `Results:\n${snippets}`;
            console.log(`[SearchHelper: Tavily] Success (${response.data.results.length} results returned).`);
            return output.trim();
        } else {
            console.warn('[SearchHelper: Tavily] No results returned.');
            return null;
        }
    } catch (error) {
        const errMsg = error.response ? `Status ${error.response.status}: ${JSON.stringify(error.response.data)}` : error.message;
        console.warn(`[SearchHelper: Tavily] Request failed: ${errMsg}`);
        return null;
    }
}

/**
 * 2. Firecrawl Search API
 * Powerful AI scraper & web crawler returning clean markdown context.
 */
async function searchFirecrawl(query, apiKey) {
    console.log(`[SearchHelper: Firecrawl] Searching for: "${query}"`);
    try {
        const response = await axios.post('https://api.firecrawl.dev/v1/search', {
            query: query,
            limit: 5,
            scrapeOptions: {
                formats: ["markdown"]
            }
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            timeout: 20000
        });

        const results = response.data && (response.data.data || response.data.results);
        if (results && results.length > 0) {
            const snippets = results.map((r, idx) => {
                const text = r.markdown || r.description || r.title || '';
                return `[${idx + 1}] ${r.title || 'Untitled'}\nURL: ${r.url || ''}\n${text.substring(0, 600)}`;
            }).join('\n\n');
            console.log(`[SearchHelper: Firecrawl] Success (${results.length} results returned).`);
            return snippets.trim();
        } else {
            console.warn('[SearchHelper: Firecrawl] No results returned.');
            return null;
        }
    } catch (error) {
        const errMsg = error.response ? `Status ${error.response.status}: ${JSON.stringify(error.response.data)}` : error.message;
        console.warn(`[SearchHelper: Firecrawl] Request failed: ${errMsg}`);
        return null;
    }
}

/**
 * 3. DuckDuckGo HTML Search
 * Free backup search implementation using simple HTML scraping.
 */
async function searchDuckDuckGo(query) {
    console.log(`[SearchHelper: DuckDuckGo] Fallback searching for: "${query}"`);
    try {
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
                'Accept-Language': 'ru,en-US;q=0.9,en;q=0.8'
            }
        });
        if (!response.ok) throw new Error(`DDG returned status ${response.status}`);
        const html = await response.text();
        const snippetMatches = html.matchAll(/<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g);
        const snippets = [];
        for (const match of snippetMatches) {
            const clean = match[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
            if (clean) snippets.push(clean);
        }
        if (snippets.length > 0) {
            console.log(`[SearchHelper: DuckDuckGo] Success (${snippets.length} snippets returned).`);
            return snippets.slice(0, 5).join('\n\n');
        }
        return '';
    } catch (e) {
        console.error('[SearchHelper: DuckDuckGo] Search failed:', e.message);
        return '';
    }
}

/**
 * Main unified web search function.
 * Automatically tries Tavily -> Firecrawl -> DuckDuckGo.
 */
async function searchWeb(query) {
    if (!query || !query.trim()) return '';
    const cleanQuery = query.trim();

    // 1. Try Tavily first
    const tavilyKey = getCleanApiKey('TAVILY_API_KEY');
    if (tavilyKey) {
        const result = await searchTavily(cleanQuery, tavilyKey);
        if (result && result.length > 50) return result;
    }

    // 2. Try Firecrawl second
    const firecrawlKey = getCleanApiKey('FIRECRAWL_API_KEY');
    if (firecrawlKey) {
        const result = await searchFirecrawl(cleanQuery, firecrawlKey);
        if (result && result.length > 50) return result;
    }

    // 3. Fallback to DuckDuckGo
    return await searchDuckDuckGo(cleanQuery);
}

module.exports = {
    searchWeb,
    searchTavily,
    searchFirecrawl,
    searchDuckDuckGo
};
