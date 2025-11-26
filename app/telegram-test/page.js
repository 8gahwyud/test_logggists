'use client'

import { useApp } from '@/lib/AppContext'
import { getTelegramUser, getTelegramUserId, isRunningInTelegram, showTelegramAlert, telegramHapticFeedback } from '@/lib/telegram'
import { useState, useEffect } from 'react'

export default function TelegramTestPage() {
  const { userId, updateUserIdFromTelegram, isRunningInTelegram: contextIsInTelegram, telegramUser } = useApp()
  const [testResults, setTestResults] = useState([])

  const addTestResult = (test, result, details = '') => {
    setTestResults(prev => [...prev, {
      test,
      result,
      details,
      timestamp: new Date().toLocaleTimeString()
    }])
  }

  const runTests = () => {
    setTestResults([])
    
    // Тест 1: Проверка доступности Telegram WebApp
    const isInTelegram = isRunningInTelegram()
    addTestResult(
      'Telegram WebApp доступен', 
      isInTelegram ? 'PASS' : 'FAIL',
      isInTelegram ? 'WebApp API обнаружен' : 'WebApp API не найден'
    )

    // Тест 2: Получение Telegram ID
    const telegramId = getTelegramUserId()
    addTestResult(
      'Получение Telegram ID',
      telegramId ? 'PASS' : 'FAIL',
      telegramId ? `ID: ${telegramId}` : 'ID не получен'
    )

    // Тест 3: Получение данных пользователя
    const user = getTelegramUser()
    addTestResult(
      'Получение данных пользователя',
      user ? 'PASS' : 'FAIL',
      user ? `Имя: ${user.full_name || 'не указано'}` : 'Данные не получены'
    )

    // Тест 4: Проверка текущего userId в контексте
    addTestResult(
      'Текущий userId в контексте',
      userId ? 'PASS' : 'FAIL',
      `ID: ${userId}`
    )

    // Тест 5: Сравнение Telegram ID и userId
    if (telegramId && userId) {
      const match = String(telegramId) === String(userId)
      addTestResult(
        'Соответствие Telegram ID и userId',
        match ? 'PASS' : 'INFO',
        match ? 'ID совпадают' : `Telegram: ${telegramId}, Context: ${userId}`
      )
    }
  }

  const testTelegramAlert = () => {
    showTelegramAlert('Тестовое уведомление из Telegram WebApp!')
  }

  const testHapticFeedback = (type) => {
    telegramHapticFeedback(type)
    addTestResult(
      `Вибрация ${type}`,
      'EXECUTED',
      'Команда отправлена'
    )
  }

  const testUserIdUpdate = () => {
    const updated = updateUserIdFromTelegram()
    addTestResult(
      'Обновление userId',
      updated ? 'UPDATED' : 'NO_CHANGE',
      updated ? 'userId был обновлен' : 'Изменений не было'
    )
  }

  useEffect(() => {
    // Автоматически запускаем тесты при загрузке
    setTimeout(runTests, 1000)
  }, [])

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Тестирование интеграции с Telegram</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <button onClick={runTests} style={buttonStyle}>
          🔄 Запустить тесты
        </button>
        <button onClick={testUserIdUpdate} style={buttonStyle}>
          🆔 Обновить userId
        </button>
        <button onClick={testTelegramAlert} style={buttonStyle}>
          🔔 Тест уведомления
        </button>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h3>Тесты вибрации:</h3>
        {['light', 'medium', 'heavy', 'success', 'warning', 'error'].map(type => (
          <button 
            key={type} 
            onClick={() => testHapticFeedback(type)} 
            style={{...buttonStyle, fontSize: '12px', padding: '5px 10px'}}
          >
            📳 {type}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h3>Текущее состояние:</h3>
        <div style={infoStyle}>
          <div><strong>Запущено в Telegram:</strong> {contextIsInTelegram ? '✅ Да' : '❌ Нет'}</div>
          <div><strong>Текущий userId:</strong> {userId}</div>
          <div><strong>Telegram ID:</strong> {getTelegramUserId() || 'не доступен'}</div>
          {telegramUser && (
            <div><strong>Имя пользователя:</strong> {telegramUser.full_name || 'не указано'}</div>
          )}
        </div>
      </div>

      <div>
        <h3>Результаты тестов:</h3>
        {testResults.length === 0 ? (
          <p>Тесты не запущены</p>
        ) : (
          <div>
            {testResults.map((result, index) => (
              <div key={index} style={{
                ...resultStyle,
                backgroundColor: result.result === 'PASS' ? '#e8f5e8' : 
                                result.result === 'FAIL' ? '#ffe8e8' : 
                                result.result === 'UPDATED' ? '#e8f0ff' : '#f0f0f0'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span><strong>{result.test}</strong></span>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    backgroundColor: result.result === 'PASS' ? '#4CAF50' : 
                                   result.result === 'FAIL' ? '#f44336' : 
                                   result.result === 'UPDATED' ? '#2196F3' : '#666',
                    color: 'white'
                  }}>
                    {result.result}
                  </span>
                </div>
                {result.details && <div style={{ fontSize: '14px', color: '#666', marginTop: '4px' }}>{result.details}</div>}
                <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>{result.timestamp}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const buttonStyle = {
  padding: '10px 15px',
  margin: '5px',
  backgroundColor: '#007bff',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer'
}

const infoStyle = {
  backgroundColor: '#f8f9fa',
  padding: '15px',
  borderRadius: '4px',
  border: '1px solid #dee2e6'
}

const resultStyle = {
  padding: '10px',
  margin: '5px 0',
  borderRadius: '4px',
  border: '1px solid #ddd'
}
