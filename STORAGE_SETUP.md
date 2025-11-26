# Настройка Storage для загрузки фото заказов

## Проблема
Ошибка: `"new row violates row-level security policy"` при загрузке фото в Storage.

## Решение

### Шаг 1: Создать bucket в Supabase Dashboard

1. Откройте Supabase Dashboard
2. Перейдите в **Storage**
3. Нажмите **New bucket**
4. Имя: `order-photos`
5. Настройки:
   - ✅ **Public bucket** - включено
   - **File size limit**: 10MB (или больше)
   - **Allowed MIME types**: `image/jpeg, image/png, image/webp, image/gif`

### Шаг 2: Настроить RLS политики

Откройте **SQL Editor** в Supabase Dashboard и выполните:

```sql
-- Удаляем все существующие политики для order-photos
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON storage.objects';
    END LOOP;
END $$;

-- Политика для чтения (публичный доступ)
CREATE POLICY "Public read access for order-photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'order-photos');

-- Политика для загрузки (разрешаем всем, так как Edge Function использует service_role)
CREATE POLICY "Allow upload to order-photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'order-photos');

-- Политика для обновления
CREATE POLICY "Allow update order-photos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'order-photos')
WITH CHECK (bucket_id = 'order-photos');

-- Политика для удаления
CREATE POLICY "Allow delete order-photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'order-photos');
```

### Шаг 3: Проверить настройки bucket

Выполните SQL для проверки:

```sql
SELECT 
    id, 
    name, 
    public, 
    file_size_limit, 
    allowed_mime_types 
FROM storage.buckets 
WHERE id = 'order-photos';
```

Должно быть:
- `public = true`
- `file_size_limit >= 10000000` (10MB)

### Шаг 4: Если политики не работают

Если ошибка все еще возникает, попробуйте временно отключить RLS (только для тестирования):

```sql
-- ВНИМАНИЕ: Только для разработки!
ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;
```

**После тестирования обязательно включите обратно:**

```sql
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
```

### Шаг 5: Проверка

После настройки:
1. Создайте заказ с фото через форму
2. Проверьте логи Edge Function - не должно быть ошибок RLS
3. Проверьте Storage bucket - фото должны появиться
4. Проверьте БД - поле `photos` должно содержать JSON массив URL

## Отладка

Если проблема сохраняется, проверьте:

1. **Логи Edge Function** - должны показывать успешную загрузку
2. **Storage bucket** - файлы должны появиться в `order-photos/`
3. **RLS политики** - выполните:
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage';
   ```






