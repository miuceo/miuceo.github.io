---
title: "Telegram MCP connector to any AI (mainly Claude)"
excerpt: "An open-source MCP connector that links Telegram \"Saved Messages\" with Claude AI based on the Model Context Protocol."
coverImage: "https://github.com/miuceo/telegram-account-mcp/raw/main/assets/banner.jpg"
createdAt: "2026-09-07T16:55:10.436Z"
updatedAt: "2026-09-07T16:55:10.436Z"
---
Artificial intelligence tools are becoming increasingly interesting to integrate with our daily work processes.

Recently, using the Model Context Protocol (MCP) standard presented by Anthropic, I completed a new open‑source project — Telegram Account MCP Connector.

💡 Why was this needed?  
We often store important notes, links, and files in Telegram’s “Saved Messages”. Through this MCP connector, Claude Desktop can now read those messages directly, locate the necessary files, filter news in channels, and even respond to messages.

![telegram-mcp](https://github.com/miuceo/telegram-account-mcp/raw/main/assets/banner.jpg)

The project was written entirely in Python (Telethon + FastMCP) technologies:  
🔹 Security first: All sessions and keys are stored 100 % locally;  
🔹 Dual mode: Adapted for Claude Desktop (stdio) and 24/7 cloud servers (Render SSE);  
🔹 Works with all Telegram chat types (channels, groups, bots, files).

The project is fully open source (MIT License) and has been posted on GitHub. I hope it will be useful for developers and AI enthusiasts:

🔗 Repository: https://github.com/miuceo/telegram-account-mcp

I look forward to your feedback! ⭐️
