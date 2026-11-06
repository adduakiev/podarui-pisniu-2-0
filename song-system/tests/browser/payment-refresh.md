# Регресія: сума оплати під час оновлення CRM

Тест запускається лише проти localhost із `LOCAL_ONLY=1`, окремим порожнім `DATA_DIR` та вигаданими даними. Потрібні Chromium і Playwright; якщо Playwright не встановлено в проєкті, передайте шлях до встановленого модуля через `PLAYWRIGHT_MODULE`. Production не використовувати.

```sh
LOCAL_ONLY=1 DATA_DIR=/tmp/pisnia-refresh-qa ADMIN_PASSWORD=fictional-refresh-password SESSION_SECRET=fictional-refresh-session-secret-over-32 NEXT_TELEMETRY_DISABLED=1 npm run dev -- --port 3105
```

В іншому терміналі:

```sh
QA_ADMIN_PASSWORD=fictional-refresh-password QA_BASE_URL=http://127.0.0.1:3105 node tests/browser/payment-refresh.cjs
```

За потреби задайте `QA_CHROMIUM=/usr/bin/chromium`. Тест окремий від `tests/*.test.ts`, не додає залежностей до production і не надсилає зовнішніх запитів. Він створює новий вигаданий лід і один тестовий платіж за прогін; сервер має використовувати виключно тестову базу.

Тест проходить мобільну форму, входить у CRM, зберігає бриф і затримує реальний локальний GET `/api/orders`. Спроба вводу `1000` починається до завершення refresh. На старій версії поле було доступне, а введене значення стиралось після зміни ключа форми. На виправленій версії поле недоступне до завершення запиту, Playwright очікує його розблокування, вводить суму в актуальну форму та перевіряє PATCH `payment.amount=100000`, етап «Текст» і суму після reload. Тест не робить reload між брифом та введенням оплати.

Джерела практики: встановлена документація Next.js `node_modules/next/dist/docs/01-app/02-guides/forms.md` (Pending states) і `testing/playwright.md`; навичка `vercel:verification`. Застосовано до українського сценарію «Хочу пісню коханому Олександру…». Повторно використовувати керовану затримку відповіді та перевірку фактичного payload, а не випадкові паузи чи обов’язковий reload як обхід дефекту.
