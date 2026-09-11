import type { Env } from './types';
import { ghListDir, ghGetFile, ghPutFileSafe } from './github';

/**
 * Standard MCP 2024-11-05 Tool Definitions
 */
const TOOLS = [
  {
    name: 'list_blog_posts',
    description: 'List all published and draft blog post slugs from the portfolio website repository.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'read_post',
    description: 'Read the markdown content (frontmatter and body) of a specific blog post in a specific language.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'The slug of the post folder (e.g. "introducing-claude-sonnet-5").',
        },
        lang: {
          type: 'string',
          enum: ['uz', 'en', 'ru'],
          description: 'The language code: uz, en, or ru.',
        },
      },
      required: ['slug', 'lang'],
    },
  },
  {
    name: 'write_post',
    description: 'Write, create, or update a markdown blog post in the portfolio GitHub repository. Directly commits to main branch and triggers automatic site deployment.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'The slug of the post folder (lowercase letters, numbers, hyphens only).',
        },
        lang: {
          type: 'string',
          enum: ['uz', 'en', 'ru'],
          description: 'The language code: uz, en, or ru.',
        },
        content: {
          type: 'string',
          description: 'The full markdown content including YAML frontmatter (title, excerpt, createdAt, coverImage).',
        },
      },
      required: ['slug', 'lang', 'content'],
    },
  },
];

interface JsonRpcRequest {
  jsonrpc: string;
  id?: string | number | null;
  method: string;
  params?: Record<string, any>;
}

function jsonRpcResponse(id: string | number | null | undefined, result: any): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      id: id ?? null,
      result,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    }
  );
}

function jsonRpcError(id: string | number | null | undefined, code: number, message: string): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      id: id ?? null,
      error: { code, message },
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}

/**
 * Verify authentication for MCP access if MCP_SECRET is configured.
 */
function isAuthorized(req: Request, env: Env): boolean {
  if (!env.MCP_SECRET) return true; // If no secret set, allow access
  const authHeader = req.headers.get('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token === env.MCP_SECRET) return true;
  }
  const url = new URL(req.url);
  const queryKey = url.searchParams.get('key') || url.searchParams.get('token');
  if (queryKey === env.MCP_SECRET) return true;
  return false;
}

/**
 * Process MCP tool calls against the GitHub repository
 */
async function executeTool(env: Env, name: string, args: Record<string, any> = {}): Promise<any> {
  if (name === 'list_blog_posts') {
    const items = await ghListDir(env, 'src/content/posts');
    const slugs = items.filter((item) => item.type === 'dir').map((item) => item.name);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(slugs, null, 2),
        },
      ],
    };
  }

  if (name === 'read_post') {
    const slug = String(args.slug || '').trim();
    const lang = String(args.lang || '').trim();
    if (!slug || !['uz', 'en', 'ru'].includes(lang)) {
      throw new Error('Invalid slug or language (must be uz, en, or ru)');
    }
    const path = `src/content/posts/${slug}/${lang}.md`;
    const file = await ghGetFile(env, path);
    if (!file) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Post not found at path: ${path}` }],
      };
    }
    return {
      content: [{ type: 'text', text: file.content }],
    };
  }

  if (name === 'write_post') {
    const slug = String(args.slug || '').trim();
    const lang = String(args.lang || '').trim();
    const content = String(args.content || '');
    if (!/^[a-z0-9-]+$/.test(slug)) throw new Error('Invalid slug format (only lowercase, digits, hyphens allowed)');
    if (!['uz', 'en', 'ru'].includes(lang)) throw new Error('Invalid language (must be uz, en, or ru)');
    if (!content.trim()) throw new Error('Content cannot be empty');

    const path = `src/content/posts/${slug}/${lang}.md`;
    const message = `Update ${slug}/${lang}.md via MCP Remote Server`;
    const res = await ghPutFileSafe(env, path, content, message);
    return {
      content: [
        {
          type: 'text',
          text: `Successfully saved ${path} to GitHub (commit SHA: ${res.sha}). The Astro site will rebuild automatically.`,
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
}

/**
 * Handles JSON-RPC 2.0 MCP messages
 */
async function handleRpcMessage(body: JsonRpcRequest, env: Env): Promise<Response> {
  const { id, method, params } = body;

  switch (method) {
    case 'initialize':
      return jsonRpcResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'muhammadjon-portfolio-remote-mcp',
          version: '1.0.0',
        },
      });

    case 'notifications/initialized':
      return new Response(null, { status: 204 });

    case 'ping':
      return jsonRpcResponse(id, {});

    case 'tools/list':
      return jsonRpcResponse(id, { tools: TOOLS });

    case 'tools/call': {
      if (!params || !params.name) {
        return jsonRpcError(id, -32602, 'Missing tool name in params');
      }
      try {
        const result = await executeTool(env, params.name, params.arguments || {});
        return jsonRpcResponse(id, result);
      } catch (err: any) {
        return jsonRpcResponse(id, {
          isError: true,
          content: [{ type: 'text', text: `Tool error: ${err.message}` }],
        });
      }
    }

    default:
      return jsonRpcError(id, -32601, `Method not found: ${method}`);
  }
}

/**
 * Main handler for all /mcp/* routes
 */
export async function handleMcpRequest(req: Request, env: Env): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  // Security authorization check
  if (!isAuthorized(req, env)) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized: Invalid or missing MCP token' }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }

  const url = new URL(req.url);
  const path = url.pathname;

  // 1. OpenAPI 3.0 specification for Gemini Spark / Custom Agents
  if (path === '/mcp/openapi.json' || path === '/mcp/openapi') {
    const openapi = {
      openapi: '3.0.3',
      info: {
        title: 'Muhammadjon Portfolio Blog API',
        description: 'API for reading and writing blog posts on muhammadjon.me',
        version: '1.0.0',
      },
      servers: [{ url: url.origin }],
      paths: {
        '/mcp/tools/list_blog_posts': {
          get: {
            summary: 'List all blog posts',
            operationId: 'list_blog_posts',
            responses: { '200': { description: 'List of post slugs' } },
          },
        },
        '/mcp/tools/read_post': {
          post: {
            summary: 'Read a blog post in uz, en, or ru',
            operationId: 'read_post',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      slug: { type: 'string' },
                      lang: { type: 'string', enum: ['uz', 'en', 'ru'] },
                    },
                    required: ['slug', 'lang'],
                  },
                },
              },
            },
            responses: { '200': { description: 'Markdown content of post' } },
          },
        },
        '/mcp/tools/write_post': {
          post: {
            summary: 'Create or update a blog post',
            operationId: 'write_post',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      slug: { type: 'string' },
                      lang: { type: 'string', enum: ['uz', 'en', 'ru'] },
                      content: { type: 'string' },
                    },
                    required: ['slug', 'lang', 'content'],
                  },
                },
              },
            },
            responses: { '200': { description: 'Save result confirmation' } },
          },
        },
      },
    };
    return new Response(JSON.stringify(openapi, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // 2. Direct tool endpoints (convenience for HTTP agents like Gemini Spark)
  if (path.startsWith('/mcp/tools/')) {
    const toolName = path.replace('/mcp/tools/', '');
    if (req.method === 'GET' && toolName === 'list_blog_posts') {
      try {
        const res = await executeTool(env, 'list_blog_posts');
        return new Response(JSON.stringify(res), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
    }
    if (req.method === 'POST') {
      try {
        const body = (await req.json()) as Record<string, any>;
        const res = await executeTool(env, toolName, body);
        return new Response(JSON.stringify(res), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
    }
  }

  // 3. MCP SSE Stream endpoint: GET /mcp/sse
  if (path === '/mcp/sse' && req.method === 'GET') {
    const sessionId = crypto.randomUUID();
    const stream = new ReadableStream({
      start(controller) {
        const origin = url.origin;
        const keyParam = url.searchParams.get('key') || url.searchParams.get('token');
        const tokenQuery = keyParam ? `&key=${encodeURIComponent(keyParam)}` : '';
        const endpointMsg = `event: endpoint\ndata: ${origin}/mcp/message?sessionId=${sessionId}${tokenQuery}\n\n`;
        controller.enqueue(new TextEncoder().encode(endpointMsg));
        controller.enqueue(new TextEncoder().encode(`: connected to muhammadjon-portfolio-remote-mcp\n\n`));
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // 4. MCP message endpoint (for SSE transport): POST /mcp/message
  if (path === '/mcp/message' && req.method === 'POST') {
    try {
      const body = (await req.json()) as JsonRpcRequest;
      return await handleRpcMessage(body, env);
    } catch (err: any) {
      return jsonRpcError(null, -32700, 'Parse error: invalid JSON');
    }
  }

  // 5. Standard Streamable / Direct HTTP MCP endpoint: POST /mcp
  if ((path === '/mcp' || path === '/mcp/') && req.method === 'POST') {
    try {
      const body = (await req.json()) as JsonRpcRequest;
      return await handleRpcMessage(body, env);
    } catch (err: any) {
      return jsonRpcError(null, -32700, 'Parse error: invalid JSON');
    }
  }

  // 6. Informative info page: GET /mcp
  if ((path === '/mcp' || path === '/mcp/') && req.method === 'GET') {
    return new Response(
      JSON.stringify(
        {
          status: 'online',
          name: 'muhammadjon-portfolio-remote-mcp',
          version: '1.0.0',
          endpoints: {
            sse: `${url.origin}/mcp/sse`,
            http: `${url.origin}/mcp`,
            openapi: `${url.origin}/mcp/openapi.json`,
          },
          tools: TOOLS.map((t) => t.name),
        },
        null,
        2
      ),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }

  return new Response('Not Found', { status: 404 });
}
