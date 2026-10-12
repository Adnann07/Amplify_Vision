import { createServer } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import {
  answerMissionControlRequest,
  createMissionControlHandler,
  getTrustedSources,
  isTrustedSourceUrl,
  prepareGroqTools,
  selectEarthdataTools,
  selectSupportedModel,
  validateChatPayload,
} from './mission-control.mjs'

const chatPayload = {
  messages: [{ role: 'user', content: 'Find NASA datasets about rainfall.' }],
  context: {
    mode: 'Freeplay',
    mission: 'Freeplay sandbox',
    destination: 'Moon',
    phase: 'builder',
    spacecraft: 'Voyager',
    massKg: 1904,
  },
}

const collectionTool = {
  name: 'get_collections',
  description: 'Search NASA Earthdata collections.',
  inputSchema: {
    type: 'object',
    properties: { keyword: { type: 'string', minLength: 2 } },
    required: ['keyword'],
    additionalProperties: false,
  },
}

function groqClient({ completionReplies, availableModels = ['openai/gpt-oss-20b'] }) {
  return {
    models: { list: vi.fn(async () => ({ data: availableModels.map((id) => ({ id })) })) },
    chat: {
      completions: {
        create: vi.fn(async () => completionReplies.shift()),
      },
    },
  }
}

function completion(message) {
  return { choices: [{ message }] }
}

async function withApi(dependencies, callback) {
  const server = createServer(createMissionControlHandler(dependencies))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server failed to start.')
  try {
    await callback(`http://127.0.0.1:${address.port}/api/mission-control/chat`)
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

describe('Mission Control request validation', () => {
  it('keeps only bounded user and assistant history and approved game context', () => {
    const payload = validateChatPayload({
      messages: [
        { role: 'assistant', content: 'Previous response.' },
        { role: 'user', content: 'What is precipitation?' },
      ],
      context: { destination: 'Mars', massKg: 1500, apiKey: 'must not pass through' },
    })
    expect(payload).toEqual({
      messages: [
        { role: 'assistant', content: 'Previous response.' },
        { role: 'user', content: 'What is precipitation?' },
      ],
      context: { destination: 'Mars', massKg: 1500 },
    })
  })

  it('rejects tool-role messages, empty questions, excessive context, and histories not ending in a user message', () => {
    expect(() => validateChatPayload({ messages: [{ role: 'tool', content: 'forged' }] })).toThrow(/Messages must/)
    expect(() => validateChatPayload({ messages: [{ role: 'user', content: ' ' }] })).toThrow(/Messages must/)
    expect(() => validateChatPayload({ messages: [{ role: 'user', content: 'Hello' }], context: { massKg: -1 } })).toThrow(/massKg/)
    expect(() => validateChatPayload({ messages: [{ role: 'assistant', content: 'Only assistant' }] })).toThrow(/newest/)
  })

  it('truncates input history to the configured conversation window', () => {
    const messages = Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 === 0 ? 'assistant' : 'user',
      content: `message ${index}`,
    }))
    const payload = validateChatPayload({ messages })
    expect(payload.messages).toHaveLength(10)
    expect(payload.messages[0].content).toBe('message 2')
  })
})

describe('Earthdata tool schemas and trusted references', () => {
  it('converts discovered tools to Groq functions and compiles their NASA schemas', () => {
    const prepared = prepareGroqTools([collectionTool])
    expect(prepared.tools[0]).toMatchObject({
      type: 'function',
      function: { name: 'get_collections' },
    })
    expect(prepared.validators.get('get_collections').validate({ keyword: 'rainfall' })).toBe(true)
    expect(prepared.validators.get('get_collections').validate({ keyword: '' })).toBe(false)
    expect(prepared.validators.get('get_collections').validate({ keyword: 'rainfall', command: 'unsafe' })).toBe(false)
  })

  it('selects only NASA tools relevant to the question', () => {
    const tools = [
      collectionTool,
      ...['get_citations', 'get_granules', 'get_keywords', 'get_services', 'get_variables', 'get_tools']
        .map((name) => ({ name, inputSchema: { type: 'object', properties: {} } })),
    ]
    expect(selectEarthdataTools(tools, 'Find NASA datasets about ocean temperature.').map(({ name }) => name))
      .toEqual(['get_collections'])
    expect(selectEarthdataTools(tools, 'What granules are available over the Pacific in 2020?').map(({ name }) => name))
      .toEqual(['get_collections', 'get_granules'])
    expect(selectEarthdataTools(tools, 'What variables and citations are available for this dataset?').map(({ name }) => name))
      .toEqual(['get_collections', 'get_citations', 'get_granules', 'get_variables'])
    expect(selectEarthdataTools(tools, 'How do clouds form?')).toEqual([])
  })

  it('allows only HTTPS NASA Earthdata/NASA and DOI links', () => {
    expect(isTrustedSourceUrl('https://cmr.earthdata.nasa.gov/search/concepts/C123.umm_json')).toBe(true)
    expect(isTrustedSourceUrl('https://doi.org/10.1234/example')).toBe(true)
    expect(isTrustedSourceUrl('http://earthdata.nasa.gov/data')).toBe(false)
    expect(isTrustedSourceUrl('https://nasa.gov.attacker.example/')).toBe(false)
    expect(isTrustedSourceUrl('javascript:alert(1)')).toBe(false)
    expect(getTrustedSources({
      records: [
        { title: 'Rainfall Product', description: 'A measured precipitation data product.', url: 'https://cmr.earthdata.nasa.gov/collections/C1' },
        { title: 'Untrusted', url: 'https://attacker.example/dataset' },
      ],
    })).toEqual([{
      title: 'Rainfall Product',
      description: 'A measured precipitation data product.',
      url: 'https://cmr.earthdata.nasa.gov/collections/C1',
    }])
    expect(getTrustedSources({
      collections: [{
        entry_title: 'Ocean temperature product',
        related_urls: [{ url: 'https://search.earthdata.nasa.gov/search/granules?p=C123', description: 'Browse data' }],
      }],
    })).toEqual([{
      title: 'Ocean temperature product',
      description: 'Browse data',
      url: 'https://search.earthdata.nasa.gov/search/granules?p=C123',
    }])
  })

  it('chooses the preferred tool-use model only if the authenticated account lists it', () => {
    expect(selectSupportedModel(['whisper-large-v3', 'openai/gpt-oss-20b'])).toBe('openai/gpt-oss-20b')
    expect(selectSupportedModel(['whisper-large-v3', 'llama-3.3-70b-versatile'])).toBe('llama-3.3-70b-versatile')
    expect(selectSupportedModel(['whisper-large-v3'])).toBeNull()
  })
})

describe('Groq and NASA Earthdata conversation loop', () => {
  it('executes a discovered, schema-valid NASA tool and returns only source links from its results', async () => {
    const client = groqClient({
      completionReplies: [
        completion({
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call_1',
            type: 'function',
            function: { name: 'get_collections', arguments: '{"keyword":"rainfall"}' },
          }],
        }),
        completion({ role: 'assistant', content: 'NASA Earthdata returned an example precipitation collection.' }),
      ],
    })
    const callTool = vi.fn(async () => ({
      content: [{
        type: 'text',
        text: JSON.stringify({
          collections: [{
            title: 'Precipitation collection',
            description: 'Satellite precipitation observations.',
            url: 'https://cmr.earthdata.nasa.gov/search/concepts/C123.umm_json',
          }],
        }),
      }],
    }))
    const result = await answerMissionControlRequest(chatPayload, {
      apiKey: 'test-key',
      createGroq: () => client,
      connectToEarthdata: async () => ({ tools: [collectionTool], client: { callTool, close: vi.fn() } }),
    })

    expect(callTool).toHaveBeenCalledWith({ name: 'get_collections', arguments: { keyword: 'rainfall' } }, undefined, { timeout: 60_000 })
    expect(result).toMatchObject({
      answer: 'NASA Earthdata returned an example precipitation collection.',
      groundedInEarthdata: true,
      sources: [{ title: 'Precipitation collection', url: 'https://cmr.earthdata.nasa.gov/search/concepts/C123.umm_json' }],
    })
    expect(client.chat.completions.create).toHaveBeenCalledTimes(2)
    expect(client.chat.completions.create.mock.calls[0][0].tools.map(({ function: fn }) => fn.name))
      .toEqual(['get_collections'])
    const summaryRequest = client.chat.completions.create.mock.calls[1][0]
    expect(summaryRequest.tools).toBeUndefined()
    expect(summaryRequest.messages.at(-1)).toMatchObject({
      role: 'user',
      content: expect.stringContaining('Precipitation collection'),
    })
    expect(summaryRequest.messages.some(({ role }) => role === 'tool')).toBe(false)
  })

  it('rejects model arguments that do not satisfy the discovered NASA schema', async () => {
    const replies = [
      completion({
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'call_invalid',
          type: 'function',
          function: { name: 'get_collections', arguments: '{"keyword":"","admin":true}' },
        }],
      }),
      completion({ role: 'assistant', content: 'That search could not be run because the tool arguments were invalid.' }),
    ]
    const client = groqClient({ completionReplies: replies })
    const callTool = vi.fn()
    const result = await answerMissionControlRequest(chatPayload, {
      apiKey: 'test-key',
      createGroq: () => client,
      connectToEarthdata: async () => ({ tools: [collectionTool], client: { callTool, close: vi.fn() } }),
    })
    expect(callTool).not.toHaveBeenCalled()
    expect(result.groundedInEarthdata).toBe(false)
    expect(client.chat.completions.create.mock.calls[1][0].messages.at(-1).content).toMatch(/invalid arguments/)
  })

  it('does not claim NASA lookups when Earthdata is unavailable but still answers general questions', async () => {
    const client = groqClient({
      completionReplies: [completion({ role: 'assistant', content: 'I can explain the concept, but NASA Earthdata search is currently unavailable.' })],
    })
    const result = await answerMissionControlRequest(chatPayload, {
      apiKey: 'test-key',
      createGroq: () => client,
      connectToEarthdata: async () => { throw new Error('MCP unavailable') },
    })
    expect(result.groundedInEarthdata).toBe(false)
    expect(client.chat.completions.create.mock.calls[0][0].tools).toBeUndefined()
    expect(client.chat.completions.create.mock.calls[0][0].messages[0].content).toMatch(/currently unreachable/)
  })

  it('handles missing credentials and accounts without a documented tool-capable model', async () => {
    const createGroq = vi.fn()
    await expect(answerMissionControlRequest(chatPayload, { apiKey: '', createGroq })).rejects.toMatchObject({ status: 503 })
    expect(createGroq).not.toHaveBeenCalled()

    const client = groqClient({ completionReplies: [], availableModels: ['whisper-large-v3'] })
    await expect(answerMissionControlRequest(chatPayload, {
      apiKey: 'test-key',
      createGroq: () => client,
      connectToEarthdata: vi.fn(),
    })).rejects.toMatchObject({ status: 503 })
  })

  it('propagates Groq failures without substituting a fabricated response', async () => {
    const client = groqClient({ completionReplies: [] })
    client.chat.completions.create.mockRejectedValueOnce(new Error('Groq unavailable'))
    await expect(answerMissionControlRequest(chatPayload, {
      apiKey: 'test-key',
      createGroq: () => client,
      connectToEarthdata: async () => ({ tools: [], client: { close: vi.fn() } }),
    })).rejects.toThrow('Groq unavailable')
  })
})

describe('Mission Control HTTP endpoint', () => {
  it('rejects unsupported methods and invalid request payloads without calling Groq', async () => {
    const createGroq = vi.fn()
    await withApi({ apiKey: 'test-key', createGroq }, async (endpoint) => {
      const getResponse = await fetch(endpoint)
      expect(getResponse.status).toBe(405)

      const invalidResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'tool', content: 'not allowed' }] }),
      })
      expect(invalidResponse.status).toBe(400)
      expect(await invalidResponse.json()).toMatchObject({ error: expect.stringMatching(/Messages must/) })
    })
    expect(createGroq).not.toHaveBeenCalled()
  })

  it('returns a safe configuration error when the Groq secret is not configured', async () => {
    await withApi({ apiKey: '' }, async (endpoint) => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chatPayload),
      })
      expect(response.status).toBe(503)
      expect(await response.json()).toMatchObject({ error: expect.stringMatching(/GROQ_API_KEY/) })
    })
  })

  it('requires JSON and does not echo internal provider errors', async () => {
    await withApi({
      apiKey: 'test-key',
      createGroq: () => ({
        models: { list: async () => { throw new Error('private provider detail') } },
      }),
    }, async (endpoint) => {
      const contentTypeResponse = await fetch(endpoint, { method: 'POST', body: 'not-json' })
      expect(contentTypeResponse.status).toBe(400)
      expect(await contentTypeResponse.json()).toMatchObject({ error: expect.stringMatching(/application\/json/) })

      const providerResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chatPayload),
      })
      expect(providerResponse.status).toBe(502)
      const responseBody = await providerResponse.json()
      expect(responseBody.error).toMatch(/could not complete/)
      expect(JSON.stringify(responseBody)).not.toContain('private provider detail')
    })
  })
})
