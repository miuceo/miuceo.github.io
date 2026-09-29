---
title: "Claude Sonnet 5.5"
excerpt: "Claude Sonnet 5.5 is a new model that is fast, inexpensive, and optimized for everyday tasks."
coverImage: "https://raw.githubusercontent.com/miuceo/images/main/images/dff17ca2802b49f5a9b01297ee6fe97f.jpg"
createdAt: "2026-09-29T03:13:47.411Z"
updatedAt: "2026-09-29T03:13:47.411Z"
---
![](https://raw.githubusercontent.com/miuceo/images/main/images/dff17ca2802b49f5a9b01297ee6fe97f.jpg)

Claude Sonnet 5.5 released: what’s new?

Yesterday, on September 28, Anthropic announced the second model of the Claude 5.5 family — Claude Sonnet 5.5. The family’s first representative, Claude Opus 5.5, was released less than a week earlier, on September 22. I teach the fundamentals of artificial intelligence, so I always try out new models myself and explain them to my students. In this post I gathered the main points about Sonnet 5.5.

What exactly is Sonnet 5.5?

Claude models are divided into three “classes,” and Sonnet sits in the middle: Opus is the most complex, reasoning‑intensive tier; Haiku is the fastest and cheapest; Sonnet is the “workhorse” for everyday tasks. Anthropic describes Sonnet 5.5 as a faster, cheaper companion to Opus 5.5 and presents it as a clearly higher‑performing model than the previous Sonnet 5.

Key updates

1. Speed. According to Anthropic, result generation is more than 30 % faster than Sonnet 5. This is the fastest Sonnet model released to date.

2. Lower cost of operation. The price list did not change, but the model consumes far fewer tokens to perform the same work. In the company’s tests, the cost of a single request drops by up to 30 % on many tasks.

3. Strong results. In the agentic programming benchmark Terminal‑Bench 4.0, Sonnet 5.5 scored 70.6 %, whereas Sonnet 5 scored 10.3 %. This is the figure announced by the company; independent verification is still pending.

4. Where it shines. Anthropic says the model excels at well‑defined daily tasks, error correction, and producing high‑quality documents, slides, and tables. Its “sharp eye for design” was also highlighted.

5. More precise writing. Compared with previous‑generation models, it is said to express ideas more clearly. Image understanding has also improved: Sonnet 5.5 is the first Sonnet model that can finish a Pokémon Red game by looking only at screen images.

Where can you use it?
* Claude apps (Sonnet 5.5 is the selectable model; the default level in apps is Medium effort).
* Claude Code – the model went live the day it was announced.
* Via API with the model identifier `claude-sonnet-5-5`.
* On Amazon Web Services, Google Cloud, and Microsoft Azure platforms.

The model’s knowledge is reliable up to June 2026. Another important update: Haiku 5.5 – the smallest and fastest model – is promised to be released in the coming weeks.

![](https://raw.githubusercontent.com/miuceo/images/main/images/cee01af25e864e14967d487fd903a301.jpg)

# Sonnet 5.5 or Opus 5.5? Price, speed, and choosing the right model

When a new model appears, the most common question is: “Which one do I need?” In this post we look at Sonnet 5.5’s price, speed, and differences from Opus 5.5 in plain language.

<!-- IMAGE 2: place at the beginning of this section, under the “Price” heading -->

Show Image

Price: unchanged, but more efficient

Sonnet 5.5’s price remains the same as Sonnet 5:

| Metric | Price (per 1 million tokens) |
|--------|------------------------------|
| Input (prompt) | $2 |
| Output (completion) | $10 |
| Cache read | $0.20 |

Even though the rates are identical, Anthropic says the model uses fewer tokens for the same work. Consequently, the final cost of a request often drops by up to 30 %. In other words, the savings come from “fewer tokens used,” not from a lower price per token.

Effort levels: you set the depth of reasoning

The model has an “effort” setting. According to the company:

* In Claude apps the default level is Medium.
* In several tests Sonnet 5.5 at Low or Medium effort outperformed the best Sonnet 5 results, with the request cost roughly ten times cheaper.
* Note: At the Max level the result was lower than at Xhigh. So choosing the “highest” setting does not always give the best outcome.

Practical takeaway: start with Medium and increase only if needed.

Sonnet 5.5 vs Opus 5.5

Anthropic describes the two as complementary:

* Opus 5.5 – for complex work that requires deep reasoning and caution.
* Sonnet 5.5 – for well‑defined everyday tasks: error fixing, document, slide, or table creation.

Interesting figure: According to The Next Web, Sonnet 5.5 scored 70.6 % on Terminal‑Bench 4.0, while Opus 5.5 reached 66.4 % at the highest effort setting. Sonnet 5.5’s token price is about half that of Opus. However, a single benchmark does not tell the whole story: this is an agentic‑programming result, and for deep‑reasoning tasks Opus still holds its own. All numbers are currently from the company and early reviews; you should test them on your own workloads.

Which model for which task?

Choose Sonnet 5.5 if you:

* Need to fix code errors or handle small‑ to medium‑size tasks;
* Want fast, high‑quality generation of documents, presentations, or tables;
* Are building an app that sends many requests and price matters;
* Require quick response times (e.g., customer support).

Choose Opus 5.5 if you:

* Have a complex, multi‑step task that demands decision‑making;
* The cost of an error is high.

Zendesk, as one of the early testers, used the model in hundreds of real‑customer support cases – exactly the kind of high‑volume, well‑defined tasks that suit Sonnet.

Note for developers

Model identifier: `claude-sonnet-5-5`. It is available on AWS, Google Cloud, and Azure with zero data retention. If you are migrating from Sonnet 5, Anthropic’s migration guide lists breaking changes – read it before moving to production.

# Sonnet 5.5: security measures and role in daily work

Previous posts covered Sonnet 5.5’s speed and price. Now let’s look at two other interesting aspects: new security protections and the model’s place in everyday work.

The first Sonnet with cybersecurity protection

Sonnet 5.5’s cybersecurity capabilities are close to those of Opus 5. Therefore it is the first Sonnet model released with Anthropic’s strongest cybersecurity safeguards and “fallback” mechanisms.

What this means in practice:

* Only narrowly scoped, high‑risk cyber queries are restricted and are visibly routed to Sonnet 5.
* Most programming and life‑sciences work is unaffected.
* Biological‑domain protections remain unchanged from Sonnet 5.
* According to The Next Web, classifiers that block attempts to extract the model’s reasoning traces have been introduced in Sonnet for the first time.

Anthropic adds that Sonnet 5.5 does not push the upper limits of the company’s model capabilities, so the security assessment scope is also narrower.

Recommendation for developers: if your workflow involves security research, expect some queries to be throttled.

Where is it useful in daily work?

Anthropic lists the model’s strengths as follows; I connect them to examples from my own practice:

* Documents, slides, tables – as a teacher I often need to quickly prepare lesson materials, presentations, and grading rubrics. This is precisely where the model shines.
* Design – Anthropic highlighted a “sharp eye for design.” Useful for mock‑ups of websites, presentations, or posters.
* Error correction – In Claude Code the model has been live since launch and works quickly on small, well‑defined tasks.
* Precise writing – The model articulates text more clearly than previous generations. Helpful for articles, emails, or lecture notes.
* Image understanding – Finishing a Pokémon Red game by looking only at screen captures demonstrates visual comprehension and long‑term reasoning ability.

Next step: Haiku 5.5

The Claude 5.5 family is not complete yet: Anthropic promised to release the smallest, fastest, and most cost‑effective model – Haiku 5.5 – in the coming weeks. It is aimed at high‑volume, price‑sensitive applications. I’ll write a separate post when it’s out.

Conclusion

Sonnet 5.5 is not the “smartest” model, but it is one of the most practical: fast, cheap, and suited to everyday tasks. One tip: when testing a new model, try it on your real workloads; benchmark numbers only give a direction.
