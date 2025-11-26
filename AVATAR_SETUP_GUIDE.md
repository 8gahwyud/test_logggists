# Гайд по настройке загрузки аватарок

## 1. Создание Storage Bucket в Supabase

1. Откройте панель Supabase: https://supabase.com/dashboard
2. Выберите ваш проект
3. Перейдите в раздел **Storage** (в левом меню)
4. Нажмите **New bucket**
5. Заполните:
   - **Name**: `avatars`
   - **Public bucket**: ✅ Включите (чтобы аватарки были доступны по публичным URL)
6. Нажмите **Create bucket**

## 2. Настройка политик доступа (Storage Policies)

После создания bucket нужно настроить политики доступа:

1. В разделе Storage найдите bucket `avatars`
2. Перейдите на вкладку **Policies**
3. **ВАЖНО**: Убедитесь, что bucket создан как **Public bucket** (это нужно для публичного доступа к файлам)

4. Создайте политику для загрузки (INSERT) - **разрешаем анонимную загрузку**:

```sql
-- Политика для загрузки аватарок (анонимный доступ для Edge Functions)
CREATE POLICY "Allow anonymous upload to avatars"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (bucket_id = 'avatars');
```

**Альтернативный вариант** (если нужна более строгая политика):

```sql
-- Политика для загрузки аватарок (для всех)
CREATE POLICY "Allow public upload to avatars"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (bucket_id = 'avatars');
```

5. Создайте политику для чтения (SELECT):

```sql
-- Политика для чтения аватарок (публичный доступ)
CREATE POLICY "Allow public read access to avatars"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'avatars');
```

6. Создайте политику для удаления (DELETE) - опционально:

```sql
-- Политика для удаления аватарок (для всех - можно ограничить позже)
CREATE POLICY "Allow public delete from avatars"
ON storage.objects
FOR DELETE
TO public
USING (bucket_id = 'avatars');
```

**Примечание**: Если политики не работают, попробуйте:
1. Убедиться, что bucket создан как **Public**
2. В настройках bucket включите опцию **Public bucket**
3. Перезапустите Edge Function после изменения политик

## 3. Добавление поля в таблицу users

Если поле `avatar_url` еще не существует в таблице `users`:

1. Перейдите в раздел **Table Editor** в Supabase
2. Выберите таблицу `users`
3. Нажмите **Add column**
4. Заполните:
   - **Name**: `avatar_url`
   - **Type**: `text`
   - **Default value**: оставьте пустым
   - **Is nullable**: ✅ Да
5. Нажмите **Save**

## 4. Проверка работы

После выполнения всех шагов:

1. Откройте форму регистрации
2. Заполните все поля
3. Выберите изображение для аватарки (максимум 5 МБ)
4. Нажмите "Зарегистрироваться"
5. Проверьте:
   - В Storage должен появиться файл в bucket `avatars`
   - В таблице `users` в поле `avatar_url` должен быть сохранен URL

## 5. Отображение аватарки

Для отображения аватарки пользователя используйте:

```jsx
<img 
  src={user.avatar_url || '/default-avatar.png'} 
  alt="Avatar" 
/>
```

## Примечания

- Максимальный размер файла: 5 МБ
- Поддерживаемые форматы: все форматы изображений (jpeg, png, gif, webp и т.д.)
- Аватарка опциональна - регистрация пройдет и без нее
- Файлы сохраняются в формате: `avatars/{telegram_id}_{timestamp}.{extension}`

