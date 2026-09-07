---
title: "Telegram MCP connector to any AI (mainly Claude)"
excerpt: "Model Context Protocol asosida Telegram \"Saved Messages\"ni Claude AI bilan bog'laydigan ochiq kodli MCP connector."
coverImage: "https://github.com/miuceo/telegram-account-mcp/raw/main/assets/banner.jpg"
createdAt: "2026-09-07T16:55:10.436Z"
updatedAt: "2026-09-07T16:55:10.436Z"
telegramHasMedia: false
---
Sun'iy intellekt vositalarini kundalik ish jarayonlarimiz bilan bog'lash tobora qiziq bo'lib bormoqda. 

Yaqinda Anthropic taqdim etgan Model Context Protocol (MCP) standartidan foydalanib, yangi ochiq kodli loyihamni yakunladim — Telegram Account MCP Connector.

💡 Bu nima uchun kerak edi?
Biz ko'pincha Telegramdagi "Saved Messages" (Saqlangan xabarlar)da muhim qaydlar, havolalar va fayllarni saqlaymiz. Ushbu MCP konnektor orqali endi Claude Desktop to'g'ridan-to'g'ri ushbu xabarlarni o'qishi, kerakli fayllarni topishi, kanallardagi yangiliklarni saralab berishi va hatto xabarlarga javob qaytarishi mumkin.

![telegram-mcp](https://github.com/miuceo/telegram-account-mcp/raw/main/assets/banner.jpg)

Loyiha to'liq Python (Telethon + FastMCP) texnologiyalarida yozildi:
🔹 Xavfsizlik birinchi o'rinda: Barcha sessiyalar va kalitlar 100% lokal saqlanadi;
🔹 Dual-rejim: Claude Desktop (stdio) va 24/7 bulutli serverlar (Render SSE) uchun moslashtirilgan;
🔹 Telegramdagi barcha chat turlari (kanallar, guruhlar, botlar, fayllar) bilan ishlaydi.

Loyiha to'liq ochiq manbali (MIT License) qilib GitHub'ga joylandi. Dasturchilar va AI ishqibozlari uchun foydali bo'ladi degan umiddaman:

🔗 Repozitoriya: https://github.com/miuceo/telegram-account-mcp

Fikr va mulohazalaringizni kutib qolaman! ⭐️
