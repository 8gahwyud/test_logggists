# Интеграция с Telegram Web Apps

## Описание

Приложение теперь поддерживает интеграцию с Telegram Web Apps API для автоматического получения ID пользователя из Telegram. Если интеграция недоступна или происходит ошибка, система автоматически использует fallback ID из состояния.

## Что было реализовано

### 1. Telegram Web Apps API интеграция (`lib/telegram.js`)
- Получение Telegram ID пользователя
- Получение данных пользователя (имя, username и т.д.)
- Инициализация WebApp
- Обработка уведомлений и вибрации
- Проверка доступности API

### 2. Обновленный AppContext (`lib/AppContext.js`)
- Автоматическое получение Telegram ID при инициализации
- Fallback на статический ID (4746736) при ошибках
- Периодическая проверка обновлений Telegram ID
- Обработка ошибок с логированием

### 3. Компонент отладки (`components/TelegramDebug/TelegramDebug.jsx`)
- Отображение текущего статуса интеграции
- Показ Telegram ID и fallback ID
- Данные пользователя из Telegram
- Информация о WebApp API

### 4. Тестовая страница (`app/telegram-test/page.js`)
- Комплексное тестирование интеграции
- Проверка всех функций Telegram API
- Тестирование уведомлений и вибрации

## Как использовать

### В Telegram
1. Создайте бота через @BotFather
2. Настройте Web App для вашего бота
3. Укажите URL вашего приложения
4. Пользователи смогут открыть приложение через бота

### В обычном браузере
- Приложение автоматически использует fallback ID
- Все функции работают как раньше

## Тестирование

### Включение отладочной информации
```javascript
// В консоли браузера или localStorage
localStorage.setItem('telegram_debug', 'true')
```

### Тестовая страница
Перейдите на `/telegram-test` для комплексного тестирования всех функций.

### Проверка в консоли
Все операции логируются с префиксом `[AppContext]` или `[Telegram]`.

## Обработка ошибок

Система автоматически обрабатывает следующие сценарии:
1. **Telegram API недоступен** → используется fallback ID
2. **Ошибка получения данных** → используется fallback ID с логированием
3. **Null/undefined ID** → используется fallback ID
4. **Сетевые ошибки** → используется fallback ID

## Структура файлов

```
lib/
├── telegram.js          # Утилиты для работы с Telegram API
└── AppContext.js        # Обновленный контекст с интеграцией

components/
└── TelegramDebug/       # Компонент отладки
    ├── TelegramDebug.jsx
    └── TelegramDebug.module.css

app/
├── layout.js            # Подключение Telegram WebApp скрипта
└── telegram-test/       # Тестовая страница
    └── page.js
```

## API функции

### Основные функции (`lib/telegram.js`)
- `getTelegramUserId()` - получить ID пользователя
- `getTelegramUser()` - получить полные данные пользователя
- `isRunningInTelegram()` - проверить, запущено ли в Telegram
- `initTelegramWebApp()` - инициализировать WebApp
- `showTelegramAlert(message)` - показать уведомление
- `telegramHapticFeedback(type)` - вибрация

### Контекст (`useApp()`)
- `userId` - текущий ID (Telegram или fallback)
- `updateUserIdFromTelegram()` - принудительное обновление ID
- `isRunningInTelegram` - статус запуска в Telegram
- `telegramUser` - данные пользователя из Telegram

## Логирование

Все операции логируются в консоль:
- ✅ Успешные операции
- ⚠️ Предупреждения (fallback)
- ❌ Ошибки

## Совместимость

- ✅ Telegram Web Apps
- ✅ Обычные браузеры (с fallback)
- ✅ Мобильные устройства
- ✅ Desktop приложения Telegram

