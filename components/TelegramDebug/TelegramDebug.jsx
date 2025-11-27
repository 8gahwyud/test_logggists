'use client'

import { useState, useEffect } from 'react'
import { getTelegramUser, getTelegramUserId, isRunningInTelegram, getTelegramTheme } from '@/lib/telegram'
import { useApp } from '@/lib/AppContext'
import styles from './TelegramDebug.module.css'

export default function TelegramDebug() {
  const { userId } = useApp()
  const [telegramData, setTelegramData] = useState(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const updateTelegramData = () => {
      const data = {
        isRunningInTelegram: isRunningInTelegram(),
        telegramUserId: getTelegramUserId(),
        telegramUser: getTelegramUser(),
        telegramTheme: getTelegramTheme(),
        currentUserId: userId,
        webAppAvailable: typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp,
        initData: typeof window !== 'undefined' && window.Telegram?.WebApp?.initData,
        initDataUnsafe: typeof window !== 'undefined' && window.Telegram?.WebApp?.initDataUnsafe
      }
      setTelegramData(data)
    }

    updateTelegramData()
    
    // Обновляем данные каждые 2 секунды для отладки
    const interval = setInterval(updateTelegramData, 2000)
    
    return () => clearInterval(interval)
  }, [userId])

  // Показываем отладочную информацию только в development режиме
  // или если в localStorage установлен флаг debug
  useEffect(() => {
    const shouldShow = process.env.NODE_ENV === 'development' || 
                      (typeof window !== 'undefined' && localStorage.getItem('telegram_debug') === 'true')
    setIsVisible(shouldShow)
  }, [])

  if (!isVisible || !telegramData) {
    return null
  }

  return (
    <div className={styles.debugPanel}>
      <div className={styles.header}>
        <h3>Telegram Debug Info</h3>
        <button 
          className={styles.closeButton}
          onClick={() => setIsVisible(false)}
        >
          ×
        </button>
      </div>
      
      <div className={styles.content}>
        <div className={styles.section}>
          <h4>Статус интеграции:</h4>
          <div className={styles.status}>
            <span className={telegramData.isRunningInTelegram ? styles.success : styles.error}>
              {telegramData.isRunningInTelegram ? '✅ Запущено в Telegram' : '❌ Не в Telegram'}
            </span>
          </div>
        </div>

        <div className={styles.section}>
          <h4>ID пользователя:</h4>
          <div className={styles.ids}>
            <div>Текущий ID: <code>{telegramData.currentUserId}</code></div>
            <div>Telegram ID: <code>{telegramData.telegramUserId || 'не доступен'}</code></div>
          </div>
        </div>

        {telegramData.telegramUser && (
          <div className={styles.section}>
            <h4>Данные пользователя Telegram:</h4>
            <pre className={styles.json}>
              {JSON.stringify(telegramData.telegramUser, null, 2)}
            </pre>
          </div>
        )}

        <div className={styles.section}>
          <h4>WebApp API:</h4>
          <div className={styles.apiStatus}>
            <div>WebApp доступен: {telegramData.webAppAvailable ? '✅' : '❌'}</div>
            <div>initData: {telegramData.initData ? '✅' : '❌'}</div>
            <div>initDataUnsafe: {telegramData.initDataUnsafe ? '✅' : '❌'}</div>
          </div>
        </div>

        {telegramData.telegramTheme && (
          <div className={styles.section}>
            <h4>Тема Telegram:</h4>
            <pre className={styles.json}>
              {JSON.stringify(telegramData.telegramTheme, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}


