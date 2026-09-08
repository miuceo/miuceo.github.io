import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Define where the portfolio files are located relative to this script
const PORTFOLIO_ROOT = path.resolve(__dirname, "..", "..");
const POSTS_DIR = path.join(PORTFOLIO_ROOT, "src", "content", "posts");
const server = new Server({
    name: "muhammadjon-portfolio-mcp",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {},
    },
});
// Define our tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "list_blog_posts",
                description: "List all existing blog post slugs.",
                inputSchema: {
                    type: "object",
                    properties: {},
                    required: [],
                },
            },
            {
                name: "read_post",
                description: "Read the markdown content of a specific blog post in a specific language.",
                inputSchema: {
                    type: "object",
                    properties: {
                        slug: {
                            type: "string",
                            description: "The slug of the post folder (e.g. 'web-site-is-changing').",
                        },
                        lang: {
                            type: "string",
                            description: "The language to read ('uz', 'ru', or 'en').",
                        },
                    },
                    required: ["slug", "lang"],
                },
            },
            {
                name: "write_post",
                description: "Write or update a markdown blog post file.",
                inputSchema: {
                    type: "object",
                    properties: {
                        slug: {
                            type: "string",
                            description: "The slug of the post.",
                        },
                        lang: {
                            type: "string",
                            description: "The language to write ('uz', 'ru', or 'en').",
                        },
                        content: {
                            type: "string",
                            description: "The full markdown content including frontmatter.",
                        },
                    },
                    required: ["slug", "lang", "content"],
                },
            },
        ],
    };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "list_blog_posts") {
        try {
            const folders = await fs.readdir(POSTS_DIR, { withFileTypes: true });
            const slugs = folders
                .filter((dirent) => dirent.isDirectory())
                .map((dirent) => dirent.name);
            return {
                content: [{ type: "text", text: JSON.stringify(slugs, null, 2) }],
            };
        }
        catch (error) {
            return {
                isError: true,
                content: [{ type: "text", text: `Error reading posts directory: ${error.message}` }],
            };
        }
    }
    if (request.params.name === "read_post") {
        const { slug, lang } = request.params.arguments;
        const filePath = path.join(POSTS_DIR, slug, `${lang}.md`);
        try {
            const content = await fs.readFile(filePath, "utf-8");
            return {
                content: [{ type: "text", text: content }],
            };
        }
        catch (error) {
            return {
                isError: true,
                content: [{ type: "text", text: `Error reading post ${slug}/${lang}.md: ${error.message}` }],
            };
        }
    }
    if (request.params.name === "write_post") {
        const { slug, lang, content } = request.params.arguments;
        const dirPath = path.join(POSTS_DIR, slug);
        const filePath = path.join(dirPath, `${lang}.md`);
        try {
            await fs.mkdir(dirPath, { recursive: true });
            await fs.writeFile(filePath, content, "utf-8");
            return {
                content: [{ type: "text", text: `Successfully wrote ${slug}/${lang}.md` }],
            };
        }
        catch (error) {
            return {
                isError: true,
                content: [{ type: "text", text: `Error writing post ${slug}/${lang}.md: ${error.message}` }],
            };
        }
    }
    throw new Error(`Tool not found: ${request.params.name}`);
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Muhammadjon's Portfolio MCP Server running on stdio");
}
main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
