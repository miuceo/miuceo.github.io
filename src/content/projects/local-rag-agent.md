---
title:
  uz: "Local RAG Agent"
  en: "Local RAG Agent"
  ru: "Local RAG Agent"
description:
  uz: "Kompyuterda mahalliy ishlaydigan Retrieval-Augmented Generation (RAG) agent — hujjatlar asosida savol-javob beradigan AI tizimi, bulutli servisga bog'liq bo'lmagan holda."
  en: "A Retrieval-Augmented Generation (RAG) agent that runs entirely on your own machine — an AI system that answers questions from your documents, with no dependency on a cloud service."
  ru: "Агент Retrieval-Augmented Generation (RAG), работающий полностью локально — ИИ-система, отвечающая на вопросы по вашим документам, без зависимости от облачных сервисов."
problem:
  uz: "Hujjatlar asosida savol-javob beruvchi tizimlar odatda bulutli AI xizmatlariga tayanadi — bu maxfiylik va API xarajati muammosini keltirib chiqaradi."
  en: "Document Q&A systems usually depend on cloud AI services — which raises both a privacy problem and an API cost."
  ru: "Системы вопрос-ответ по документам обычно зависят от облачных ИИ-сервисов — это создаёт проблему приватности и стоимости API."
solution:
  uz: "Ollama (lokal LLM), Chroma (vektor bazasi) va LangChain'dan foydalanib, to'liq mahalliy ishlaydigan RAG quvur liniyasini qurdim."
  en: "Built a fully local RAG pipeline using Ollama for the local LLM, Chroma as the vector store, and LangChain to wire them together."
  ru: "Построил полностью локальный RAG-конвейер на Ollama (локальная LLM), Chroma (векторная база) и LangChain для связки."
result:
  uz: "Internetga ulanmasdan, hech qanday API kalitisiz hujjatlar bo'yicha savol-javob qilish imkoniyati."
  en: "Documents can be queried offline, with no API key and no internet connection required."
  ru: "Возможность задавать вопросы по документам офлайн — без API-ключа и без подключения к интернету."
tags: ["Python", "Ollama", "LangChain", "Chroma", "RAG"]
status: "active"
url: "https://github.com/miuceo/local-rag-agent"
githubRepo: "miuceo/local-rag-agent"
external: true
order: 4
---
