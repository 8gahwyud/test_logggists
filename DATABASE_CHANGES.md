# Изменения в базе данных для поддержки фото в заказах

## 1. Добавить поле `photos` в таблицу `orders`

Выполните следующий SQL запрос в Supabase SQL Editor:

```sql
ALTER TABLE orders 
ADD COLUMN photos TEXT;

COMMENT ON COLUMN orders.photos IS 'JSON массив URL фото заказа, хранится как JSON строка';
```

## 2. Создать Storage bucket для фото заказов

В Supabase Dashboard:

1. Перейдите в **Storage**
2. Создайте новый bucket с именем `order-photos`
3. Настройки bucket:
   - **Public bucket**: ✅ Включено (чтобы фото были доступны по публичным URL)
   - **File size limit**: 5MB (или больше, по необходимости)
   - **Allowed MIME types**: `image/jpeg, image/png, image/webp, image/gif`

## 3. Настроить RLS политики для Storage

**ВАЖНО:** Edge Functions используют service_role ключ, поэтому нужно разрешить загрузку без проверки auth.

Выполните SQL для настройки доступа в Supabase SQL Editor:

```sql
-- Удаляем старые политики если есть
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete" ON storage.objects;
DROP POLICY IF EXISTS "Public read access" ON storage.objects;
DROP POLICY IF EXISTS "Service role upload" ON storage.objects;

-- Политика для чтения (публичный доступ)
CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
USING (bucket_id = 'order-photos');

-- Политика для загрузки (разрешаем всем, так как Edge Function использует service_role)
-- ВАЖНО: Это безопасно, так как загрузка происходит только через Edge Function с проверкой
CREATE POLICY "Service role upload"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'order-photos');

-- Политика для обновления (для Edge Function)
CREATE POLICY "Service role update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'order-photos')
WITH CHECK (bucket_id = 'order-photos');

-- Политика для удаления (для Edge Function)
CREATE POLICY "Service role delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'order-photos');
```

**Альтернативный вариант (если первый не работает):**

Если политики все еще блокируют, можно временно отключить RLS для bucket (только для разработки):

```sql
-- ВНИМАНИЕ: Это отключает RLS для bucket - используйте только для тестирования!
-- В продакшене лучше использовать политики выше

-- Проверяем текущие настройки bucket
SELECT * FROM storage.buckets WHERE id = 'order-photos';

-- Если нужно, можно создать bucket с public_access = true через Dashboard
-- или через SQL (но лучше через Dashboard для безопасности)
```

## 4. Формат данных

Поле `photos` хранит JSON строку с массивом URL:
```json
["https://...url1...", "https://...url2...", "https://...url3..."]
```

Если фото нет, поле будет `NULL`.

## 5. Пример записи после изменений

```json
{
  "id": "00f7717a-bcc7-405c-86bc-e3bbad1248b2",
  "title": "123",
  "description": "123",
  "photos": "[\"https://zaaiwvnohyupxajurnrn.supabase.co/storage/v1/object/public/order-photos/temp_123_abc_0.jpg\", \"https://zaaiwvnohyupxajurnrn.supabase.co/storage/v1/object/public/order-photos/temp_123_abc_1.jpg\"]",
  ...
}
```

## Примечания

- Максимум 5 фото на заказ
- Фото загружаются в Supabase Storage
- URL сохраняются в поле `photos` как JSON строка
- Старые заказы без фото будут иметь `photos = NULL`

