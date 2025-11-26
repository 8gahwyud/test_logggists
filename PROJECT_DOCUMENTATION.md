# 📖 Документация проекта Truvo Logists

## 🎯 Обзор проекта

**Truvo Logists** - это веб-платформа для управления логистическими заказами, которая соединяет заказчиков с исполнителями (логистами). Платформа обеспечивает эффективное управление заказами, коммуникацию между участниками и систему оплаты.

### 🏗️ Архитектура

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend      │    │   Database      │
│   (Next.js)     │◄──►│   (Node.js)     │◄──►│  (Supabase)     │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🚀 Быстрый старт

### Предварительные требования

- Node.js 16.x или выше
- npm или yarn
- Git

### Установка

```bash
# 1. Клонирование репозитория
git clone https://github.com/your-username/truvo-logists.git
cd truvo-logists

# 2. Установка зависимостей
npm install

# 3. Настройка переменных окружения
cp .env.example .env.local
# Отредактируйте .env.local с вашими настройками

# 4. Запуск в режиме разработки
npm run dev

# 5. Открыть в браузере
# http://localhost:3000
```

### Переменные окружения

```env
# .env.local
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXTAUTH_SECRET=your_nextauth_secret
NEXTAUTH_URL=http://localhost:3000
```

## 📁 Структура проекта

```
truvo-logists/
├── components/              # React компоненты
│   ├── BottomNav/          # Нижняя навигация
│   ├── CreateOrderPage/    # Создание заказов
│   ├── FinalizeOrderModal/ # Модалка завершения заказа
│   ├── Header/             # Шапка сайта
│   ├── OrderModal/         # Модалка заказа
│   ├── OrdersPage/         # Страница заказов
│   ├── ProfilePage/        # Страница профиля
│   └── SubscriptionModal/  # Модалка подписок
├── lib/                    # Утилиты и хелперы
│   └── AppContext.js       # Глобальный контекст приложения
├── pages/                  # Next.js страницы
│   ├── api/               # API роуты
│   ├── orders/            # Страница заказов
│   ├── profile/           # Страница профиля
│   └── create-order/      # Создание заказа
├── styles/                # CSS стили
├── public/                # Статические файлы
├── backend.ts             # Серверная логика
└── package.json           # Зависимости проекта
```

## 🔧 Основные компоненты

### AppContext.js
Глобальный контекст приложения, управляющий:
- Состоянием пользователя
- API вызовами
- Уведомлениями
- Балансом и подписками

```javascript
// Использование контекста
import { useApp } from '@/lib/AppContext'

function MyComponent() {
  const { userId, profile, callApi, showAlert } = useApp()
  // ...
}
```

### OrdersPage
Основная страница для управления заказами:
- Список заказов с фильтрацией
- Модалка деталей заказа
- Система статусов заказов
- Интеграция с чатом

### CreateOrderPage
Страница создания новых заказов:
- Форма с валидацией
- Загрузка фотографий
- Расчет стоимости
- Интеграция с картами

### ProfilePage
Страница профиля пользователя:
- Информация о подписке
- Статистика заказов
- Настройки профиля
- Управление балансом

## 🎨 Система дизайна

### Цветовая палитра

```css
:root {
  --primary-color: #1775F1;      /* Основной синий */
  --secondary-color: #059669;     /* Зеленый успеха */
  --error-color: #DC2626;         /* Красный ошибки */
  --warning-color: #F59E0B;       /* Желтый предупреждения */
  --background-color: #F3F4F6;    /* Фон страницы */
  --text-primary: #111827;        /* Основной текст */
  --text-secondary: #6B7280;      /* Вторичный текст */
  --border-color: #E5E7EB;        /* Границы */
}
```

### Типографика

```css
/* Заголовки */
.title-large { font-size: 24px; font-weight: 700; }
.title-medium { font-size: 20px; font-weight: 600; }
.title-small { font-size: 16px; font-weight: 600; }

/* Текст */
.body-large { font-size: 16px; font-weight: 400; }
.body-medium { font-size: 14px; font-weight: 400; }
.body-small { font-size: 12px; font-weight: 400; }
```

### Компоненты UI

#### Кнопки
```css
.button-primary {
  background: var(--primary-color);
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  border: none;
  font-weight: 600;
}

.button-secondary {
  background: transparent;
  color: var(--primary-color);
  border: 1px solid var(--primary-color);
}
```

#### Карточки
```css
.card {
  background: white;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border: 1px solid var(--border-color);
}
```

## 🔄 Workflow разработки

### Git Flow

1. **Создание feature ветки**
```bash
git checkout develop
git pull origin develop
git checkout -b feature/new-functionality
```

2. **Разработка и коммиты**
```bash
# Следуйте conventional commits
git add .
git commit -m "feat(orders): add order filtering functionality"
```

3. **Создание Pull Request**
```bash
git push origin feature/new-functionality
# Создать PR через GitHub UI
```

4. **Code Review и мерж**
- Минимум 1 аппрув для develop
- Минимум 2 аппрува для main
- Все проверки CI должны пройти

### Соглашения о коммитах

```bash
feat:     новая функциональность
fix:      исправление бага
docs:     обновление документации
style:    форматирование, отсутствующие точки с запятой и т.д.
refactor: рефакторинг кода
test:     добавление тестов
chore:    обновление задач сборки, настроек и т.д.

# Примеры:
feat(auth): add user registration
fix(orders): resolve status update issue
docs(readme): update installation guide
```

## 🧪 Тестирование

### Структура тестов

```
tests/
├── __mocks__/              # Моки
├── components/             # Тесты компонентов
├── pages/                  # Тесты страниц
├── utils/                  # Тесты утилит
└── e2e/                    # End-to-end тесты
```

### Запуск тестов

```bash
# Unit тесты
npm test

# Тесты с покрытием
npm run test:coverage

# E2E тесты
npm run test:e2e

# Линтинг
npm run lint

# Проверка типов
npm run type-check
```

### Пример теста компонента

```javascript
// components/__tests__/OrderCard.test.js
import { render, screen } from '@testing-library/react'
import OrderCard from '../OrderCard'

describe('OrderCard', () => {
  const mockOrder = {
    id: 1,
    title: 'Test Order',
    status: 'pending',
    price: 1000
  }

  it('renders order information correctly', () => {
    render(<OrderCard order={mockOrder} />)
    
    expect(screen.getByText('Test Order')).toBeInTheDocument()
    expect(screen.getByText('1000₽')).toBeInTheDocument()
  })
})
```

## 🚀 Деплой

### Staging окружение

```bash
# Автоматический деплой при пуше в develop
git push origin develop
# Доступно на: https://staging.truvo-logists.com
```

### Production окружение

```bash
# Автоматический деплой при пуше в main
git push origin main
# Доступно на: https://truvo-logists.com
```

### Ручной деплой

```bash
# Сборка проекта
npm run build

# Запуск в production режиме
npm start

# Или с PM2
pm2 start ecosystem.config.js
```

## 📊 Мониторинг и логирование

### Метрики производительности

- **Core Web Vitals**: LCP, FID, CLS
- **Время загрузки**: < 3 секунд
- **Доступность**: 99.9% uptime
- **Ошибки**: < 0.1% error rate

### Логирование

```javascript
// Использование логгера
import { logger } from '@/lib/logger'

logger.info('User logged in', { userId: 123 })
logger.error('API call failed', { error, endpoint })
logger.warn('Slow query detected', { query, duration })
```

### Аналитика

- **Google Analytics**: Поведение пользователей
- **Sentry**: Отслеживание ошибок
- **LogRocket**: Записи сессий пользователей

## 🔐 Безопасность

### Аутентификация и авторизация

```javascript
// Проверка прав доступа
function requireAuth(handler) {
  return async (req, res) => {
    const token = req.headers.authorization
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    
    const user = await verifyToken(token)
    req.user = user
    return handler(req, res)
  }
}
```

### Валидация данных

```javascript
// Схема валидации заказа
const orderSchema = {
  title: { type: 'string', minLength: 3, maxLength: 100 },
  description: { type: 'string', maxLength: 1000 },
  price: { type: 'number', minimum: 0 },
  location: { type: 'string', required: true }
}
```

### Защита от атак

- **CSRF**: Токены для форм
- **XSS**: Санитизация входных данных
- **SQL Injection**: Параметризованные запросы
- **Rate Limiting**: Ограничение запросов

## 🐛 Отладка и решение проблем

### Частые проблемы

#### 1. Проблемы с аутентификацией
```bash
# Проверить переменные окружения
echo $NEXTAUTH_SECRET

# Очистить cookies
# Application → Storage → Cookies → Clear All

# Проверить токены в localStorage
localStorage.getItem('auth-token')
```

#### 2. Проблемы с API
```bash
# Проверить статус Supabase
curl -I https://your-project.supabase.co/rest/v1/

# Проверить логи
npm run logs

# Включить debug режим
DEBUG=* npm run dev
```

#### 3. Проблемы с производительностью
```bash
# Анализ бандла
npm run analyze

# Профилирование React
# React DevTools → Profiler

# Lighthouse аудит
npm run lighthouse
```

### Логи и мониторинг

```javascript
// Настройка логирования
const winston = require('winston')

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
})
```

## 📱 Мобильная версия

### Responsive дизайн

```css
/* Брейкпоинты */
@media (max-width: 640px) {  /* Mobile */
  .container { padding: 16px; }
}

@media (min-width: 641px) and (max-width: 1024px) {  /* Tablet */
  .container { padding: 24px; }
}

@media (min-width: 1025px) {  /* Desktop */
  .container { padding: 32px; }
}
```

### PWA функциональность

```javascript
// manifest.json
{
  "name": "Truvo Logists",
  "short_name": "Truvo",
  "description": "Платформа для логистов",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#1775F1",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    }
  ]
}
```

## 🔧 Настройка IDE

### VS Code расширения

```json
// .vscode/extensions.json
{
  "recommendations": [
    "bradlc.vscode-tailwindcss",
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "ms-vscode.vscode-typescript-next",
    "formulahendry.auto-rename-tag",
    "christian-kohler.path-intellisense"
  ]
}
```

### Настройки проекта

```json
// .vscode/settings.json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.preferences.importModuleSpecifier": "relative",
  "emmet.includeLanguages": {
    "javascript": "javascriptreact"
  }
}
```

## 📚 API документация

### Основные эндпоинты

#### Аутентификация
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

#### Заказы
```http
GET /api/orders
Authorization: Bearer <token>

# Ответ
{
  "orders": [
    {
      "id": 1,
      "title": "Доставка документов",
      "status": "pending",
      "price": 1000,
      "created_at": "2023-01-01T00:00:00Z"
    }
  ]
}
```

#### Создание заказа
```http
POST /api/orders
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Новый заказ",
  "description": "Описание заказа",
  "price": 1500,
  "location": "Москва"
}
```

### Коды ошибок

| Код | Описание |
|-----|----------|
| 400 | Неверный запрос |
| 401 | Не авторизован |
| 403 | Доступ запрещен |
| 404 | Не найдено |
| 422 | Ошибка валидации |
| 500 | Внутренняя ошибка сервера |

## 🤝 Участие в разработке

### Как внести вклад

1. **Fork репозитория**
2. **Создать feature ветку**
3. **Внести изменения**
4. **Добавить тесты**
5. **Создать Pull Request**

### Стандарты кода

- Используйте ESLint и Prettier
- Покрытие тестами > 80%
- Следуйте принципам SOLID
- Документируйте сложную логику

### Code Review

- Проверяйте функциональность
- Обращайте внимание на производительность
- Следите за безопасностью
- Проверяйте читаемость кода

## 📞 Поддержка

### Контакты

- **Email**: support@truvo-logists.com
- **Slack**: #truvo-development
- **GitHub Issues**: [Создать issue](https://github.com/your-username/truvo-logists/issues)

### FAQ

**Q: Как сбросить пароль?**
A: Используйте функцию "Забыли пароль" на странице входа.

**Q: Как добавить новую роль пользователя?**
A: Обновите enum в базе данных и добавьте соответствующие проверки в коде.

**Q: Как настроить уведомления?**
A: Настройки уведомлений находятся в профиле пользователя.

---

## 📝 История изменений

### v1.2.0 (2024-01-15)
- Добавлена система подписок
- Улучшена мобильная версия
- Исправлены критические баги

### v1.1.0 (2023-12-20)
- Добавлен чат между пользователями
- Система рейтингов
- Интеграция с картами

### v1.0.0 (2023-11-01)
- Первый релиз
- Базовая функциональность заказов
- Система аутентификации

---

**Примечание**: Эта документация регулярно обновляется. Последнее обновление: $(date +%Y-%m-%d)
