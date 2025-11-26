# Гайд: Завершение заказа с оценкой исполнителей

## 1. Изменения в базе данных

### Добавить поля в таблицу `users`:

```sql
ALTER TABLE users 
ADD COLUMN phone_number VARCHAR(20),
ADD COLUMN card_number VARCHAR(20),
ADD COLUMN bank_name VARCHAR(100);
```

**Описание полей:**
- `phone_number` - номер телефона для перевода (например: "+7 (999) 123-45-67")
- `card_number` - номер карты/счета (например: "2200 1234 5678 9012")
- `bank_name` - название банка (например: "Сбербанк")

## 2. Обновление backend.ts

### В функции `finalizeOrder`:

1. **Получить информацию о реквизитах исполнителей:**
```typescript
// После получения участников заказа, добавить:
const participantsWithDetails = await Promise.all(
  participantTelegramIds.map(async (telegramId) => {
    const { data: user } = await supabase
      .from("users")
      .select("telegram_id, username, phone_number, card_number, bank_name, rating")
      .eq("telegram_id", telegramId)
      .single();
    
    return {
      telegram_id: telegramId,
      name: user?.username || `User ${telegramId}`,
      phone_number: user?.phone_number || null,
      card_number: user?.card_number || null,
      bank_name: user?.bank_name || null,
      rating: user?.rating || 50
    };
  })
);
```

2. **Вернуть данные для модалки:**
```typescript
return successResponse({
  success: true,
  order_id: order_id,
  total_amount: totalAmount,
  participants: participantsWithDetails.map(p => ({
    telegram_id: p.telegram_id,
    name: p.name,
    phone_number: p.phone_number,
    card_number: p.card_number,
    bank_name: p.bank_name,
    payment_amount: perPersonAmount,
    rating: p.rating
  })),
  message: "Order ready for finalization"
});
```

### Новая функция для сохранения оценок:

```typescript
case "savePerformerRatings":
  {
    const { order_id, logist_id, ratings } = body;
    // ratings = [{ performer_id, result, punctuality, communication }, ...]
    
    if (!order_id || !logist_id || !ratings || !Array.isArray(ratings)) {
      return errorResponse("order_id, logist_id and ratings array required");
    }
    
    const logistTelegramId = Number(logist_id);
    
    // Проверяем, что заказ принадлежит логисту
    const { data: order } = await supabase
      .from("orders")
      .select("created_by")
      .eq("id", order_id)
      .single();
    
    if (Number(order.created_by) !== logistTelegramId) {
      return errorResponse("Not authorized");
    }
    
    // Сохраняем оценки для каждого исполнителя
    for (const rating of ratings) {
      const { performer_id, result, punctuality, communication } = rating;
      
      await saveRatingCharacteristics(
        supabase,
        order_id,
        Number(performer_id),
        logistTelegramId,
        result,
        punctuality,
        communication
      );
    }
    
    return successResponse({
      success: true,
      message: "Ratings saved successfully"
    });
  }
```

### Функция для завершения заказа после оценки:

```typescript
case "completeOrderAfterRating":
  {
    const { order_id, logist_id } = body;
    
    // Проверяем, что все исполнители оценены
    const { data: order } = await supabase
      .from("orders")
      .select("executor_ids")
      .eq("id", order_id)
      .single();
    
    const executorIds = (order.executor_ids || "").split(",").filter(Boolean);
    
    // Проверяем наличие оценок для всех исполнителей
    const { data: ratings } = await supabase
      .from("ratings")
      .select("rated_id")
      .eq("order_id", order_id)
      .eq("rater_role", "logist");
    
    const ratedIds = ratings?.map(r => String(r.rated_id)) || [];
    const allRated = executorIds.every(id => ratedIds.includes(id));
    
    if (!allRated) {
      return errorResponse("Not all performers have been rated");
    }
    
    // Обновляем статус заказа на "completed"
    const { error: updateErr } = await supabase
      .from("orders")
      .update({ status: "completed" })
      .eq("id", order_id);
    
    if (updateErr) {
      return errorResponse("Error updating order status");
    }
    
    // Здесь можно добавить логику выплат, уведомлений и т.д.
    
    return successResponse({
      success: true,
      message: "Order completed successfully"
    });
  }
```

## 3. Обновление фронтенда

### В `OrderModal.jsx`:

1. **Добавить состояние для модалки завершения:**
```javascript
const [isFinalizeModalOpen, setIsFinalizeModalOpen] = useState(false)
const [finalizeData, setFinalizeData] = useState(null)
```

2. **При клике на "Завершить заказ":**
```javascript
const handleFinalizeClick = async () => {
  try {
    const resp = await callApi({
      action: "finalizeOrder",
      order_id: order.id,
      logist_id: userId
    })
    
    if (resp?.success && resp?.participants) {
      setFinalizeData({
        order_id: order.id,
        total_amount: resp.total_amount,
        participants: resp.participants,
        date: new Date().toLocaleDateString('ru-RU')
      })
      setIsFinalizeModalOpen(true)
    }
  } catch (error) {
    await showAlert("Ошибка", "Не удалось загрузить данные для завершения")
  }
}
```

3. **Рендер модалки:**
```javascript
{isFinalizeModalOpen && finalizeData && (
  <FinalizeOrderModal
    data={finalizeData}
    onClose={() => setIsFinalizeModalOpen(false)}
    onComplete={handleCompleteAfterRating}
  />
)}
```

## 4. Структура компонента FinalizeOrderModal

### Состояния:
- `expandedPerformer` - ID развернутого исполнителя (null если все свернуты)
- `ratings` - объект с оценками: `{ [performer_id]: { result, punctuality, communication } }`

### Логика:
1. При открытии все исполнители свернуты
2. При клике на карточку исполнителя она разворачивается
3. В развернутом виде показываются:
   - Реквизиты (карта и телефон)
   - Форма оценки (3 критерия по 5 звезд)
4. Кнопка "Завершить заказ" активна только когда все исполнители оценены
5. При клике на "Завершить заказ":
   - Отправляем оценки через `savePerformerRatings`
   - Затем завершаем заказ через `completeOrderAfterRating`

## 5. API вызовы

### Получение данных для завершения:
```javascript
POST /functions/v1/smart-api
{
  "action": "finalizeOrder",
  "order_id": "...",
  "logist_id": 123
}
```

### Сохранение оценок:
```javascript
POST /functions/v1/smart-api
{
  "action": "savePerformerRatings",
  "order_id": "...",
  "logist_id": 123,
  "ratings": [
    {
      "performer_id": 456,
      "result": 4,
      "punctuality": 5,
      "communication": 4
    },
    // ...
  ]
}
```

### Завершение заказа:
```javascript
POST /functions/v1/smart-api
{
  "action": "completeOrderAfterRating",
  "order_id": "...",
  "logist_id": 123
}
```

## 6. Валидация

- Все поля реквизитов опциональны (могут быть null)
- Оценки обязательны для всех исполнителей перед завершением
- Каждая оценка: от 1 до 5 звезд
- Проверка, что логист является создателем заказа

## 7. UI/UX

- Модалка выезжает снизу (как все остальные)
- Карточки исполнителей с hover-эффектом
- Плавная анимация разворачивания
- Визуальная индикация незаполненных оценок
- Копирование реквизитов в буфер обмена







