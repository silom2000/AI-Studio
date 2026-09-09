const test = require('node:test');
const assert = require('node:assert/strict');

const ai = require('../ai-client.cjs');

test('extracts text from standard and block-based chat responses', () => {
    assert.equal(
        ai._extractChatContent({ choices: [{ message: { content: '  hello  ' } }] }),
        'hello'
    );
    assert.equal(
        ai._extractChatContent({
            choices: [{
                message: {
                    content: [
                        { type: 'text', text: 'one' },
                        { type: 'text', text: 'two' }
                    ]
                }
            }]
        }),
        'one\ntwo'
    );
});

test('treats missing, null, and whitespace-only content as empty', () => {
    assert.equal(ai._extractChatContent({}), '');
    assert.equal(
        ai._extractChatContent({ choices: [{ message: { content: null } }] }),
        ''
    );
    assert.equal(
        ai._extractChatContent({ choices: [{ message: { content: '   ' } }] }),
        ''
    );
});

test('retries when a provider returns HTTP 200 with empty content', async () => {
    const originalFetch = global.fetch;
    const originalKey = process.env.POLLINATIONS_API_KEY;
    let calls = 0;

    process.env.POLLINATIONS_API_KEY = 'test-key';
    global.fetch = async () => {
        calls += 1;
        const payload = calls === 1
            ? {
                choices: [{
                    finish_reason: 'content_filter',
                    message: { content: null, refusal: null }
                }]
            }
            : {
                choices: [{
                    finish_reason: 'stop',
                    message: { content: '{"ok":true}', refusal: null }
                }]
            };

        return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify(payload)
        };
    };

    try {
        const result = await ai.chat(
            [{ role: 'user', content: 'Return JSON' }],
            true,
            'pollinations'
        );

        assert.equal(result, '{"ok":true}');
        assert.equal(calls, 2);
    } finally {
        global.fetch = originalFetch;
        if (originalKey === undefined) {
            delete process.env.POLLINATIONS_API_KEY;
        } else {
            process.env.POLLINATIONS_API_KEY = originalKey;
        }
    }
});
