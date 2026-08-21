# miuceo-worker — joylashtirish (deploy) qo'llanmasi

Bu Worker sayt uchun kerak bo'lgan barcha maxfiy narsalarni (GitHub token,
Telegram bot token) o'zida saqlaydi — shunda brauzerda ular hech qachon
saqlanmaydi. Nima uchun bu kerakligi haqida `ARCHITECTURE.md` §3–4 bo'limida
batafsil yozilgan.

Quyidagi barcha qadamlar Cloudflare'ning bepul tarifida ishlaydi (D10). Hech
bir qadam pul talab qilmaydi.

## Kerakli narsalar

- Cloudflare account (bepul — agar hali yo'q bo'lsa [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up))
- `cd worker && npm install` (agar birinchi marta sozlayotgan bo'lsangiz, bu allaqachon bajarilgan)

## 1-qadam. Tizimga kirish

```bash
npx wrangler login
```

Bu buyruq brauzerda Cloudflare orqali kirish oynasini ochadi. Bu sizning
shaxsiy accountingizga bog'liq bo'lgani uchun, bu qadamni men sizning
o'rningizga bajara olmayman — buni faqat siz o'zingiz qilishingiz kerak.

## 2-qadam. D1 ma'lumotlar bazasini yaratish

```bash
npx wrangler d1 create miuceo-db
```

Buyruq natijasida chiqqan `database_id` qiymatini nusxalab, `wrangler.toml`
faylidagi `REPLACE_AFTER_WRANGLER_D1_CREATE` o'rniga qo'ying.

## 3-qadam. Migratsiyani ishga tushirish

```bash
npm run d1:migrate:remote
```

Bu `sessions` jadvalini yaratadi (`migrations/0001_create_sessions.sql`
faylidan).

## 4-qadam. Maxfiy kalitlarni (secrets) sozlash

To'rtta kalit kerak bo'ladi, ular repo ichidagi hech qanday faylga
yozilmaydi:

```bash
npx wrangler secret put GH_TOKEN
# GitHub Personal Access Token'ni qo'ying — "Contents: Read & write" huquqi bilan,
# faqat miuceo/miuceo.github.io repositoriyasiga cheklangan bo'lsin

npx wrangler secret put TG_BOT_TOKEN
# @BotFather'dan olingan @miuceo_pws_bot tokenini qo'ying.
# Faqat kanalga post yuborish uchun — bot webhook'i yo'q, Telegram
# bu Worker'ga hech qachon o'zi murojaat qilmaydi.

npx wrangler secret put GROQ_API_KEY
# console.groq.com — bepul, karta talab qilinmaydi.
# AI tarjima va matn yaxshilash uchun asosiy provayder (ARCHITECTURE.md §10).

npx wrangler secret put OPENROUTER_API_KEY
# openrouter.ai — bepul tarifda kuniga 50 ta so'rov (karta bilan 1000 ta).
# Groq ishlamay qolsa, zaxira provayder sifatida ishlatiladi (D12).

```

AI kalitlari bo'lmasa sayt va nashr qilish odatdagidek ishlayveradi — faqat
`/post-builder/` dagi "AI yordamchi" tugmalari xato qaytaradi.

**Bu uchun yangi GitHub token yarating** — v1'da `localStorage`'da turgan
eski tokenni qayta ishlatmang. Uni buzilgan (compromised) deb hisoblang va
Worker to'liq ishlashi tasdiqlangandan so'ng
[github.com/settings/tokens](https://github.com/settings/tokens) sahifasida
bekor qiling (`ARCHITECTURE.md` §9 Phase 2, §10 risklar bo'limi).

## 5-qadam. Joylashtirish (deploy)

```bash
npm run deploy
```

Bu buyruq Worker manzilini chiqaradi:
`https://miuceo-worker.<sizning-subdomain>.workers.dev`.

## 6-qadam. Saytni Worker'ga ulash

`login.html`, `admin.html`, `post-builder.html` — v1 sahifalari hozircha bu
Worker'ga murojaat qilmaydi. Ularni ulash — alohida, ehtiyotkorlik bilan
qilinadigan qadam, va faqat Worker to'liq ishlashi boshidan oxirigacha
tasdiqlangandan keyin amalga oshiriladi (`SKILLS.md`dagi `v1-safe-edit`
qoidasi: hozirgi ishlab turgan yagona publishing yo'lini, uning o'rnini
bosuvchi narsa haqiqatan ham ishlamaguncha o'zgartirmang). Bu qadam uchun
yuqoridagi joylashtirilgan Worker manzili kerak bo'ladi.

## Mahalliy (local) ishlab chiqish

```bash
npm run dev              # wrangler dev — jonli bindinglar bilan mahalliy server
npm run d1:migrate:local # migratsiyalarni mahalliy D1 nusxasiga qo'llash
```

`wrangler dev` mahalliy sozlashda maxfiy kalitlar uchun alohida `.dev.vars`
faylini talab qiladi — batafsil
[Cloudflare hujjatlarida](https://developers.cloudflare.com/workers/configuration/secrets/#local-development-with-secrets).
`.dev.vars` fayli allaqachon asosiy `.gitignore`'da bor — uni hech qachon
commit qilmang.

## Ishlab turganini tekshirish

```bash
curl -i https://<sizning-worker-manzilingiz>/api/session
# kutilgan javob: 401 {"ok":false,"error":"Not authenticated"} — bu to'g'ri,
# bu Worker ishlab turganini va auth tekshiruvi o'z vazifasini bajarayotganini bildiradi
```

## Hech narsa sizib chiqmaganini tekshirish

Bu Worker'ga ishonib, real hayotda ishlatishdan oldin `SKILLS.md`dagi
`repo-security-pass` ro'yxatini bajarib chiqing. Xususan: `wrangler.toml`
faylida hech qanday maxfiy kalit *qiymati* bo'lmasligi kerak — faylning
pastki qismidagi izohda faqat kalit *nomlari* bo'lishi kerak. Agar bu
faylning diff'ida haqiqiy token ko'rsangiz, darhol to'xtang va uni bekor
qiling (rotate).
