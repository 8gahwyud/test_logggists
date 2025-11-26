
// Тест для проверки модалки завершения заказа
console.log('=== ТЕСТ МОДАЛКИ ЗАВЕРШЕНИЯ ===');

// Создаем тестовые данные
const testData = {
  order_id: 123,
  logist_id: 20011123,
  total_amount: 5000,
  participants: [
    {
      telegram_id: 111,
      name: 'Тестовый исполнитель',
      payment_amount: 2500,
      card_number: '1234 5678 9012 3456',
      bank_name: 'Сбербанк'
    }
  ],
  date: new Date().toLocaleDateString('ru-RU')
};

// Сохраняем в localStorage
const storageKey = `finalize_order_${testData.order_id}`;
localStorage.setItem(storageKey, JSON.stringify({
  data: testData,
  timestamp: Date.now()
}));

console.log('Тестовые данные сохранены в localStorage:', storageKey);
console.log('Перезагрузите страницу для проверки восстановления модалки');

