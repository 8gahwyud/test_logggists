'use client'

/**
 * Утилиты для работы с Telegram Web Apps API
 */

// Проверяем, доступен ли Telegram WebApp API
export const isTelegramWebApp = () => {
  return typeof window !== 'undefined' && 
         window.Telegram && 
         window.Telegram.WebApp && 
         window.Telegram.WebApp.initData
}

// Получаем данные пользователя из Telegram WebApp
export const getTelegramUser = () => {
  if (!isTelegramWebApp()) {
    console.warn('[Telegram] WebApp API недоступен')
    return null
  }

  try {
    const webApp = window.Telegram.WebApp
    
    // Проверяем, есть ли данные пользователя
    if (!webApp.initDataUnsafe || !webApp.initDataUnsafe.user) {
      console.warn('[Telegram] Данные пользователя недоступны')
      return null
    }

    const user = webApp.initDataUnsafe.user
    
    console.log('[Telegram] Данные пользователя получены:', {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      username: user.username,
      language_code: user.language_code
    })

    return {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      username: user.username,
      language_code: user.language_code,
      full_name: [user.first_name, user.last_name].filter(Boolean).join(' ')
    }
  } catch (error) {
    console.error('[Telegram] Ошибка получения данных пользователя:', error)
    return null
  }
}

// Получаем только Telegram ID пользователя
export const getTelegramUserId = () => {
  const user = getTelegramUser()
  return user ? user.id : null
}

// Инициализация Telegram WebApp
export const initTelegramWebApp = () => {
  if (!isTelegramWebApp()) {
    console.warn('[Telegram] WebApp API недоступен для инициализации')
    return false
  }

  try {
    const webApp = window.Telegram.WebApp
    
    // Расширяем WebApp на весь экран
    webApp.expand()
    
    // Включаем кнопку "Назад" если нужно
    webApp.BackButton.hide()
    
    // Настраиваем главную кнопку
    webApp.MainButton.hide()
    
    // Устанавливаем цветовую схему
    webApp.setHeaderColor('#ffffff')
    
    console.log('[Telegram] WebApp инициализирован успешно')
    return true
  } catch (error) {
    console.error('[Telegram] Ошибка инициализации WebApp:', error)
    return false
  }
}

// Показать уведомление в Telegram
export const showTelegramAlert = (message) => {
  if (!isTelegramWebApp()) {
    // Fallback для обычного браузера
    alert(message)
    return
  }

  try {
    window.Telegram.WebApp.showAlert(message)
  } catch (error) {
    console.error('[Telegram] Ошибка показа уведомления:', error)
    alert(message) // Fallback
  }
}

// Показать подтверждение в Telegram
export const showTelegramConfirm = (message) => {
  return new Promise((resolve) => {
    if (!isTelegramWebApp()) {
      // Fallback для обычного браузера
      resolve(confirm(message))
      return
    }

    try {
      window.Telegram.WebApp.showConfirm(message, (confirmed) => {
        resolve(confirmed)
      })
    } catch (error) {
      console.error('[Telegram] Ошибка показа подтверждения:', error)
      resolve(confirm(message)) // Fallback
    }
  })
}

// Закрыть WebApp
export const closeTelegramWebApp = () => {
  if (!isTelegramWebApp()) {
    console.warn('[Telegram] WebApp API недоступен для закрытия')
    return
  }

  try {
    window.Telegram.WebApp.close()
  } catch (error) {
    console.error('[Telegram] Ошибка закрытия WebApp:', error)
  }
}

// Вибрация (если поддерживается)
export const telegramHapticFeedback = (type = 'light') => {
  if (!isTelegramWebApp()) {
    return
  }

  try {
    const webApp = window.Telegram.WebApp
    if (webApp.HapticFeedback) {
      switch (type) {
        case 'light':
          webApp.HapticFeedback.impactOccurred('light')
          break
        case 'medium':
          webApp.HapticFeedback.impactOccurred('medium')
          break
        case 'heavy':
          webApp.HapticFeedback.impactOccurred('heavy')
          break
        case 'success':
          webApp.HapticFeedback.notificationOccurred('success')
          break
        case 'warning':
          webApp.HapticFeedback.notificationOccurred('warning')
          break
        case 'error':
          webApp.HapticFeedback.notificationOccurred('error')
          break
        default:
          webApp.HapticFeedback.impactOccurred('light')
      }
    }
  } catch (error) {
    console.error('[Telegram] Ошибка вибрации:', error)
  }
}

// Проверка, запущено ли приложение в Telegram
export const isRunningInTelegram = () => {
  return typeof window !== 'undefined' && 
         window.Telegram && 
         window.Telegram.WebApp
}

// Получение информации о теме Telegram
export const getTelegramTheme = () => {
  if (!isTelegramWebApp()) {
    return null
  }

  try {
    const webApp = window.Telegram.WebApp
    return {
      colorScheme: webApp.colorScheme, // 'light' или 'dark'
      themeParams: webApp.themeParams
    }
  } catch (error) {
    console.error('[Telegram] Ошибка получения темы:', error)
    return null
  }
}




