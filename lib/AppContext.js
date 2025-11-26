'use client'

import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import ConfirmModal from '@/components/ConfirmModal/ConfirmModal'
import LoadingScreen from '@/components/LoadingScreen/LoadingScreen'
import ErrorScreen from '@/components/ErrorScreen/ErrorScreen'
import NotificationToast from '@/components/NotificationToast/NotificationToast'
import NotificationsModal from '@/components/NotificationsModal/NotificationsModal'
import RegistrationModal from '@/components/RegistrationModal/RegistrationModal'
import { getTelegramUserId, getTelegramUser, initTelegramWebApp, isRunningInTelegram } from '@/lib/telegram'

const SUPABASE_URL = "https://zaaiwvnohyupxajurnrn.supabase.co"
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphYWl3dm5vaHl1cHhhanVybnJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MDgwNTUsImV4cCI6MjA3MzA4NDA1NX0.IaQjZ-oxkFzIhiTsACXOEZxL5kAzXh-CdmsDBZth8bI"
const API_URL = "https://zaaiwvnohyupxajurnrn.supabase.co/functions/v1/smart-api"

// Создаем один глобальный экземпляр Supabase клиента
let supabaseClientInstance = null
const getSupabaseClient = () => {
  if (!supabaseClientInstance) {
    supabaseClientInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  }
  return supabaseClientInstance
}

const AppContext = createContext()

export function AppProvider({ children }) {
  // Функция для получения userId с поддержкой Telegram
  const getUserId = useCallback(() => {
    const fallbackId = "4746736"
    
    try {
      // Проверяем, доступен ли Telegram WebApp
      if (!isRunningInTelegram()) {
        console.log('[AppContext] Приложение не запущено в Telegram, используем fallback ID:', fallbackId)
        return fallbackId
      }
      
      // Пытаемся получить Telegram ID
      const telegramId = getTelegramUserId()
      
      if (telegramId && telegramId !== null && telegramId !== undefined) {
        console.log('[AppContext] ✅ Успешно получен Telegram ID:', telegramId)
        return String(telegramId)
      }
      
      // Если Telegram ID недоступен, используем fallback
      console.warn('[AppContext] ⚠️ Telegram ID недоступен или равен null/undefined, используем fallback ID:', fallbackId)
      return fallbackId
      
    } catch (error) {
      console.error('[AppContext] ❌ Ошибка получения Telegram ID:', error)
      console.log('[AppContext] Используем fallback ID:', fallbackId)
      return fallbackId
    }
  }, [])

  const [userId, setUserId] = useState(() => getUserId())
  
  // Функция для обновления userId с проверкой Telegram
  const updateUserIdFromTelegram = useCallback(() => {
    try {
      const newUserId = getUserId()
      if (newUserId !== userId) {
        console.log('[AppContext] Обновляем userId с', userId, 'на', newUserId)
        setUserId(newUserId)
        return true
      }
      return false
    } catch (error) {
      console.error('[AppContext] Ошибка обновления userId:', error)
      return false
    }
  }, [userId, getUserId])
  const [userName, setUserName] = useState(null)
  const [profile, setProfile] = useState(null)
  const [orders, setOrders] = useState(null) // null = еще не загружено, [] = загружено но пусто
  const [balance, setBalance] = useState(null)
  const [operations, setOperations] = useState(null)
  const [currentOrderFilter, setCurrentOrderFilter] = useState("active")
  const [supabase, setSupabase] = useState(null)
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', type: 'alert', onConfirm: null, onCancel: null, confirmText: 'OK', cancelText: 'Отмена' })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isNetworkError, setIsNetworkError] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [currentToasts, setCurrentToasts] = useState([]) // Массив toast'ов для отображения в столбик
  const [hiddenToasts, setHiddenToasts] = useState([]) // Сохраняем тосты при скрытии
  const [isNotificationsModalOpen, setIsNotificationsModalOpen] = useState(false)
  const [isAnyModalOpen, setIsAnyModalOpen] = useState(false) // Отслеживание открытых модалок
  const [isRegistrationModalOpen, setIsRegistrationModalOpen] = useState(false) // Модалка регистрации
  const lastNotificationCheckRef = useRef(null) // Время последней проверки уведомлений
  const MAX_TOASTS = 3 // Максимальное количество одновременно отображаемых toast'ов

  // Функция для проверки, включены ли уведомления
  const areNotificationsEnabled = () => {
    if (typeof window === 'undefined') return true
    const saved = localStorage.getItem('notificationsEnabled')
    return saved === null || saved === 'true' // По умолчанию включены
  }

  // Отладка изменений currentToasts
  useEffect(() => {
    console.log('[AppContext] currentToasts изменился:', currentToasts.length, 'toast\'ов')
    currentToasts.forEach((toast, idx) => {
      console.log(`[AppContext] Toast ${idx + 1}:`, toast?.id, toast?.message)
    })
  }, [currentToasts])

  // При открытии любой модалки скрываем все toast'ы
  useEffect(() => {
    if (isAnyModalOpen || isNotificationsModalOpen || isRegistrationModalOpen) {
      console.log('[AppContext] Модалка открыта, скрываем все toast\'ы')
      // Сохраняем текущие тосты перед скрытием и очищаем текущие
      setCurrentToasts(prev => {
        if (prev.length > 0) {
          // Сохраняем в скрытые
          setHiddenToasts(hidden => {
            // Объединяем с уже скрытыми, избегая дубликатов
            const existingIds = new Set(hidden.map(t => t.id))
            const newToasts = prev.filter(t => !existingIds.has(t.id))
            return [...hidden, ...newToasts]
          })
        }
        return []
      })
    } else {
      // При закрытии модалки показываем сохраненные тосты
      setHiddenToasts(prev => {
        if (prev.length > 0) {
          console.log('[AppContext] Модалка закрыта, показываем сохраненные toast\'ы:', prev.length)
          // Показываем сохраненные тосты
          setCurrentToasts(current => {
            // Объединяем с текущими, избегая дубликатов
            const existingIds = new Set(current.map(t => t.id))
            const toastsToShow = prev.filter(t => !existingIds.has(t.id))
            const combined = [...current, ...toastsToShow]
            // Оставляем только последние MAX_TOASTS
            return combined.slice(-MAX_TOASTS)
          })
          return []
        }
        return prev
      })
    }
  }, [isAnyModalOpen, isNotificationsModalOpen, isRegistrationModalOpen])

  // Тестовые функции для проверки (можно вызвать из консоли)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.testToast = () => {
        console.log('[TEST] Тестируем toast')
        const testNotification = {
          id: 'test-' + Date.now(),
          message: 'Тестовое уведомление',
          payload: JSON.stringify({ type: 'new_response', order_id: 'test' }),
          read: false,
          is_read: false
        }
        setCurrentToasts(prev => {
          const newToasts = [...prev, testNotification]
          // Оставляем только последние MAX_TOASTS
          return newToasts.slice(-MAX_TOASTS)
        })
      }
      
      window.checkRealtimeSubscriptions = () => {
        console.log('[TEST] Проверка real-time подписок')
        console.log('[TEST] Количество каналов:', realtimeChannelsRef.current.length)
        realtimeChannelsRef.current.forEach((channel, idx) => {
          console.log(`[TEST] Канал ${idx + 1}:`, channel.topic)
        })
        console.log('[TEST] userId:', userId)
        console.log('[TEST] supabase клиент:', supabase ? 'есть' : 'нет')
      }
      
      console.log('[AppContext] Тестовые функции доступны:')
      console.log('[AppContext] - window.testToast() - тест toast')
      console.log('[AppContext] - window.checkRealtimeSubscriptions() - проверка подписок')
    }
  }, [userId, supabase])
  const realtimeChannelsRef = useRef([])
  const currentChatOrderIdRef = useRef(null)
  const currentModalOrderIdRef = useRef(null)
  const loadMessagesRef = useRef(null)
  const loadResponsesRef = useRef(null)
  const refreshChatRef = useRef(null)
  const refreshChatCallbackRef = useRef(null)
  const addMessageToChatRef = useRef(null)
  const updateResponseInModalRef = useRef(null) // Для бесшовного обновления отклика
  const refreshOrdersRef = useRef(null) // Для прямого обновления заказов

  const callApi = useCallback(async (payload = {}) => {
    console.log("[callApi] Отправка запроса:", payload)
    console.log("[callApi] JSON строка:", JSON.stringify(payload))

    try {
      const bodyString = JSON.stringify(payload)
      console.log("[callApi] Тело запроса (строка):", bodyString)
      
      const res = await fetch(API_URL, {
        method: "POST",
        mode: "cors",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          "apikey": SUPABASE_ANON_KEY,
          "x-client-info": "shabashka-frontend"
        },
        body: bodyString
      })

      console.log("[callApi] Ответ сервера, status:", res.status)
      const text = await res.text()
      console.log("[callApi] Ответ сервера, body:", text)

      if (!res.ok) {
        try { 
          const parsed = JSON.parse(text)
          // Если это объект, извлекаем message или преобразуем в строку
          const errorMessage = typeof parsed === 'string' 
            ? parsed 
            : parsed?.message || parsed?.code || JSON.stringify(parsed)
          return { success: false, error: errorMessage }; 
        } 
        catch { return { success: false, error: text || `HTTP ${res.status}` }; }
      }
      try { return JSON.parse(text); } 
      catch { return { success: true, data: text }; }
    } catch (e) {
      console.error("[callApi] Fetch failed:", e)
      // Определяем сетевую ошибку
      const isNetworkErr = e instanceof TypeError && (
        e.message.includes('fetch') || 
        e.message.includes('network') || 
        e.message.includes('Failed to fetch') ||
        e.message.includes('NetworkError')
      )
      return { 
        success: false, 
        error: e.message || String(e),
        isNetworkError: isNetworkErr
      }
    }
  }, [])

  const loadUserBalance = useCallback(async () => {
    if (!userId) {
      console.warn("[loadUserBalance] userId ещё не инициализирован")
      return
    }

    const resp = await callApi({
      action: "getUserBalance",
      user_id: userId
    })

    console.log("[loadUserBalance] Ответ:", resp)

    if (resp?.success) {
      const isUserNotFound = resp.user_not_found === true || resp.user_not_found === "true" || resp.user_not_found === 1
      
      if (isUserNotFound) {
        console.log("[loadUserBalance] ✅✅✅ Логист не найден")
        return { user_not_found: true }
      }
      
      setBalance({
        available: (resp.balance?.available ?? 0) + "₽"
      })
      setOperations(resp.transactions || [])
      
      // Обновляем информацию о пользователе если она пришла
      if (resp.user) {
        console.log("[loadUserBalance] Данные пользователя:", resp.user)
        const username = resp.user.username || resp.user.name || null
        if (username) {
          console.log("[loadUserBalance] Обновляем имя на:", username)
          setUserName(username)
        }
        setProfile({
          subscription_tier: resp.user.subscription_tier || null,
          subscription_id: resp.user.subscription_id || null,
          subscription: resp.user.subscription || null,
          daily_collected_count: resp.user.daily_collected_count || 0,
          rating: resp.user.rating || null,
          characteristics: resp.user.characteristics || null,
          avatar_url: resp.user.avatar_url || null
        })
      }
      
      return resp
    } else {
      console.error("[loadUserBalance] Не удалось загрузить баланс:", resp?.error)
      return resp
    }
  }, [userId, callApi])

  const loadUserOrders = useCallback(async () => {
    if (!userId) {
      console.warn("[loadUserOrders] userId не установлен")
      return
    }
    
    try {
      console.log("[loadUserOrders] Загрузка заказов для логиста:", userId)
      const resp = await callApi({
        action: "getLogistOrders",
        logist_id: userId
      })

      console.log("[loadUserOrders] Ответ API:", resp)
      console.log("[loadUserOrders] resp.success:", resp?.success)
      console.log("[loadUserOrders] resp.orders:", resp?.orders?.length || 0)

      // Проверяем на сетевую ошибку
      if (resp?.isNetworkError) {
        throw new Error("Network error")
      }

      if (resp?.success && resp.orders) {
        const logistId = Number(userId)
        
        // Проверяем photos в заказах до фильтрации
        resp.orders.forEach(order => {
          if (order.photos) {
            console.log(`[loadUserOrders] Заказ ${order.id} имеет photos:`, order.photos, 'тип:', typeof order.photos, 'isArray:', Array.isArray(order.photos))
          }
        })
        
        const filteredOrders = (resp.orders || []).filter(order => {
          const orderCreatedBy = Number(order.created_by)
          const matches = orderCreatedBy === logistId
          if (!matches) {
            console.warn(`[loadUserOrders] Отфильтрован заказ: ${order.id}, created_by=${orderCreatedBy} !== logist_id=${logistId}`)
          }
          return matches
        })
        
        // Проверяем photos в отфильтрованных заказах
        filteredOrders.forEach(order => {
          if (order.photos) {
            console.log(`[loadUserOrders] Отфильтрованный заказ ${order.id} имеет photos:`, order.photos, 'тип:', typeof order.photos, 'isArray:', Array.isArray(order.photos))
          } else {
            console.log(`[loadUserOrders] Отфильтрованный заказ ${order.id} НЕ имеет photos`)
          }
        })
        
        console.log("[loadUserOrders] Загружено заказов:", filteredOrders.length)
        console.log("[loadUserOrders] Вызываем setOrders с", filteredOrders.length, "заказами")
        setOrders(filteredOrders)
        console.log("[loadUserOrders] setOrders вызван")
      } else {
        console.warn("[loadUserOrders] Не удалось загрузить заказы:", resp?.error)
        setOrders([])
      }
    } catch (error) {
      console.error("[loadUserOrders] Ошибка:", error)
      // Не устанавливаем ошибку здесь, чтобы не блокировать интерфейс при обновлении
      setOrders([])
    }
  }, [userId, callApi])

  const initUser = useCallback(async () => {
    console.log("[initUser] Загрузка данных пользователя:", userId)
    setIsLoading(true)
    setError(null)
    setIsNetworkError(false)
    
    try {
      // Загружаем баланс и данные пользователя
      const balanceResp = await loadUserBalance()
      
      if (balanceResp && (balanceResp.user_not_found === true || balanceResp.user_not_found === "true")) {
        console.log("[initUser] ⚠️ Логист не найден, показываем форму регистрации")
        setIsLoading(false)
        setIsRegistrationModalOpen(true)
        setIsAnyModalOpen(true)
        return
      }
      
      // Проверяем на ошибку сети
      if (balanceResp && balanceResp.isNetworkError) {
        console.log("[initUser] ⚠️ Сетевая ошибка при загрузке баланса")
        setError("Ошибка подключения к серверу")
        setIsNetworkError(true)
        setIsLoading(false)
        return
      }
      
      if (!balanceResp?.success) {
        console.log("[initUser] ⚠️ Ошибка при загрузке баланса")
        const errorMessage = balanceResp?.error 
          ? (typeof balanceResp.error === 'string' 
              ? balanceResp.error 
              : balanceResp.error?.message || balanceResp.error?.code || JSON.stringify(balanceResp.error))
          : "Ошибка при загрузке данных"
        setError(errorMessage)
        setIsLoading(false)
        return
      }
      
      console.log("[initUser] ✅ Логист найден, продолжаем загрузку данных")
      await loadUserOrders()
      // Если заказы загружены успешно, завершаем загрузку
      setIsLoading(false)
    } catch (error) {
      console.error("[initUser] Исключение при инициализации:", error)
      const isNetworkErr = error instanceof TypeError && (
        error.message.includes('fetch') || 
        error.message.includes('network') || 
        error.message.includes('Failed to fetch')
      )
      setError(error.message || "Ошибка при загрузке данных")
      setIsNetworkError(isNetworkErr)
      setIsLoading(false)
    }
  }, [userId, loadUserBalance, loadUserOrders])

  const cleanupRealtimeSubscriptions = useCallback((client) => {
    console.log("[cleanupRealtimeSubscriptions] Отключение подписок:", realtimeChannelsRef.current.length)
    const clientToUse = client || supabase
    if (clientToUse) {
      realtimeChannelsRef.current.forEach(channel => {
        clientToUse.removeChannel(channel)
      })
    }
    realtimeChannelsRef.current = []
  }, [supabase])

  const initRealtimeSubscriptions = useCallback((client) => {
    if (!client) {
      console.warn("[initRealtimeSubscriptions] Supabase клиент не готов")
      return
    }
    if (!userId) {
      console.warn("[initRealtimeSubscriptions] userId не готов, пропускаем инициализацию")
      return
    }

    console.log("[initRealtimeSubscriptions] Инициализация real-time подписок для логиста:", userId)
    console.log("[initRealtimeSubscriptions] userId тип:", typeof userId, "значение:", userId)

    // Очищаем предыдущие подписки
    cleanupRealtimeSubscriptions(client)

    const logistId = Number(userId)
    console.log("[initRealtimeSubscriptions] logistId (Number):", logistId, "тип:", typeof logistId)

    // Подписка на изменения в order_messages (сообщения чата)
    const messagesChannel = client
      .channel('order_messages_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'order_messages'
      }, async (payload) => {
        console.log('[Realtime] Изменение в order_messages:', payload)
        
        // Обрабатываем только INSERT события (новые сообщения)
        if (payload.eventType !== 'INSERT' && payload.event !== 'INSERT') {
          return
        }
        
        if (!payload.new) {
          return
        }
        
        const orderId = payload.new.order_id
        if (!orderId) {
          return
        }
        
        // Если открыт чат для этого заказа, бесшовно добавляем новое сообщение
        if (currentChatOrderIdRef.current && Number(orderId) === Number(currentChatOrderIdRef.current)) {
          console.log('[Realtime] ✅ Заказ совпадает, добавляем сообщение бесшовно:', payload.new.id)
          
          // Бесшовно добавляем новое сообщение без перезагрузки всего чата
          if (addMessageToChatRef.current) {
            try {
              addMessageToChatRef.current(payload.new)
              console.log('[Realtime] ✅ Сообщение добавлено бесшовно')
            } catch (error) {
              console.error('[Realtime] Ошибка при добавлении сообщения:', error)
            }
          } else {
            console.warn('[Realtime] ⚠️ addMessageToChatRef.current не установлен')
          }
        }
      })
      .subscribe((status) => {
        console.log('[Realtime] Статус подписки на order_messages:', status)
      })

    realtimeChannelsRef.current.push(messagesChannel)

    // Подписка на изменения в order_responses (отклики)
    const orderResponsesChannel = client
      .channel('order_responses_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'order_responses'
      }, async (payload) => {
        console.log('[Realtime] Изменение в order_responses:', payload)
        const orderId = payload.new?.order_id || payload.old?.order_id
        
        // Если открыто модальное окно для этого заказа, бесшовно обновляем отклик
        if (currentModalOrderIdRef.current && orderId && Number(orderId) === Number(currentModalOrderIdRef.current)) {
          console.log('[Realtime] ✅ Заказ совпадает, обновляем отклик бесшовно в модалке')
          
          // Для UPDATE событий - бесшовно обновляем конкретный отклик
          if ((payload.eventType === 'UPDATE' || payload.event === 'UPDATE') && payload.new) {
            if (updateResponseInModalRef.current) {
              try {
                updateResponseInModalRef.current(payload.new)
                console.log('[Realtime] ✅ Отклик обновлен бесшовно:', payload.new.id)
              } catch (error) {
                console.error('[Realtime] Ошибка при бесшовном обновлении отклика:', error)
                // Fallback: полная перезагрузка
                if (loadResponsesRef.current) {
                  await loadResponsesRef.current()
                }
              }
            } else {
              // Fallback: полная перезагрузка если функция не установлена
              console.warn('[Realtime] ⚠️ updateResponseInModalRef.current не установлен, используем полную перезагрузку')
              if (loadResponsesRef.current) {
                try {
                  await loadResponsesRef.current()
                  console.log('[Realtime] ✅ Отклики обновлены через полную перезагрузку')
                } catch (error) {
                  console.error('[Realtime] Ошибка при загрузке откликов:', error)
                }
              }
            }
          } else {
            // Для INSERT/DELETE - полная перезагрузка
            if (loadResponsesRef.current) {
              try {
                await loadResponsesRef.current()
                console.log('[Realtime] ✅ Отклики обновлены (INSERT/DELETE)')
              } catch (error) {
                console.error('[Realtime] Ошибка при загрузке откликов:', error)
              }
            }
          }
        }
        
        // Всегда обновляем список заказов для обновления счетчиков (как в оригинале)
        await loadUserOrders()
      })
      .subscribe((status) => {
        console.log('[Realtime] Статус подписки на order_responses:', status)
      })

    realtimeChannelsRef.current.push(orderResponsesChannel)

    // Подписка на изменения в orders (изменения статусов заказов)
    // Пробуем без фильтра сначала, чтобы увидеть все события
    const ordersChannel = client
      .channel('orders_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders'
        // Убираем фильтр временно для отладки
      }, async (payload) => {
        console.log('[Realtime] Изменение в orders:', payload)
        const payloadCreatedBy = payload.new?.created_by || payload.old?.created_by
        console.log('[Realtime] payload.created_by:', payloadCreatedBy, 'наш logistId:', logistId)
        
        // Проверяем на фронтенде, относится ли заказ к нашему логисту
        if (payloadCreatedBy && Number(payloadCreatedBy) === logistId) {
          console.log('[Realtime] ✅ Заказ относится к нашему логисту, обновляем список')
          console.log('[Realtime] Вызываем loadUserOrders для обновления списка')
          try {
            await loadUserOrders()
            console.log('[Realtime] ✅ loadUserOrders завершен')
          } catch (error) {
            console.error('[Realtime] Ошибка при loadUserOrders:', error)
          }
        } else {
          console.log('[Realtime] ⚠️ Заказ не относится к нашему логисту, пропускаем')
        }
      })
      .subscribe((status) => {
        console.log('[Realtime] Статус подписки на orders:', status)
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] ✅ Подписка на orders активна, logistId:', logistId)
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[Realtime] ❌ Ошибка подписки на orders')
        } else if (status === 'TIMED_OUT') {
          console.error('[Realtime] ❌ Подписка на orders тайм-аут')
        } else if (status === 'CLOSED') {
          console.error('[Realtime] ❌ Подписка на orders закрыта')
        }
      })

    realtimeChannelsRef.current.push(ordersChannel)

    // Подписка на изменения в transactions (обновление баланса)
    const transactionsChannel = client
      .channel('transactions_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'transactions',
        filter: `user_id=eq.${logistId}`
      }, async (payload) => {
        console.log('[Realtime] Изменение в transactions:', payload)
        await loadUserBalance()
      })
      .subscribe()

    realtimeChannelsRef.current.push(transactionsChannel)

    // Подписка на изменения в users (обновление баланса)
    const usersChannel = client
      .channel('users_changes')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'users',
        filter: `telegram_id=eq.${logistId}`
      }, async (payload) => {
        console.log('[Realtime] Изменение в users (баланс):', payload)
        await loadUserBalance()
      })
      .subscribe()

    realtimeChannelsRef.current.push(usersChannel)

    // Подписка на изменения в notifications (уведомления)
    console.log('[initRealtimeSubscriptions] Создаем подписку на notifications для user_id:', logistId)
    console.log('[initRealtimeSubscriptions] Фильтр будет: user_id=eq.' + logistId)
    
    // Сначала создаем тестовую подписку БЕЗ фильтра для отладки
    const testNotificationsChannel = client
      .channel(`notifications_test_${logistId}_${Date.now()}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications'
        // БЕЗ фильтра для тестирования
      }, async (payload) => {
        console.log('[Realtime TEST] ========== ЛЮБОЕ УВЕДОМЛЕНИЕ (БЕЗ ФИЛЬТРА) ==========')
        console.log('[Realtime TEST] payload.new?.user_id:', payload.new?.user_id, 'наш logistId:', logistId)
        if (payload.new && Number(payload.new.user_id) === logistId) {
          console.log('[Realtime TEST] ✅ Это уведомление для нашего пользователя!')
        } else {
          console.log('[Realtime TEST] ⚠️ Это уведомление НЕ для нашего пользователя')
        }
      })
      .subscribe((status) => {
        console.log('[Realtime TEST] Статус тестовой подписки (без фильтра):', status)
      })
    
    realtimeChannelsRef.current.push(testNotificationsChannel)
    
    // Основная подписка С фильтром
    const notificationsChannel = client
      .channel(`notifications_changes_${logistId}_${Date.now()}`) // Уникальное имя канала
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${logistId}`
      }, async (payload) => {
        console.log('[Realtime] ========== НОВОЕ УВЕДОМЛЕНИЕ ==========')
        console.log('[Realtime] Полный payload:', JSON.stringify(payload, null, 2))
        console.log('[Realtime] logistId для фильтра:', logistId)
        console.log('[Realtime] payload.new?.user_id:', payload.new?.user_id)
        
        if (payload.new) {
          const newNotification = payload.new
          console.log('[Realtime] Данные нового уведомления:', {
            id: newNotification.id,
            user_id: newNotification.user_id,
            read: newNotification.read,
            is_read: newNotification.is_read,
            message: newNotification.message,
            payload: newNotification.payload,
            created_at: newNotification.created_at
          })
          
          // Проверяем, что уведомление для нашего пользователя
          const notificationUserId = Number(newNotification.user_id)
          if (notificationUserId !== logistId) {
            console.warn('[Realtime] ⚠️ Уведомление не для нашего пользователя:', {
              notificationUserId,
              logistId,
              match: notificationUserId === logistId
            })
            return
          }
          
          // Добавляем новое уведомление в список
          setNotifications(prev => {
            // Проверяем, нет ли уже такого уведомления
            const exists = prev.some(n => String(n.id) === String(newNotification.id))
            if (exists) {
              console.log('[Realtime] Уведомление уже есть в списке, пропускаем')
              return prev
            }
            console.log('[Realtime] Добавляем уведомление в список. Было:', prev.length, 'станет:', prev.length + 1)
            return [newNotification, ...prev]
          })
          
          // Показываем toast только если оно не прочитано
          // Проверяем оба поля: read и is_read (могут быть null, false, true)
          const readValue = newNotification.read
          const isReadValue = newNotification.is_read
          // Уведомление непрочитано, если оба поля false или null/undefined
          const isUnread = (readValue === false || readValue === null || readValue === undefined) && 
                          (isReadValue === false || isReadValue === null || isReadValue === undefined)
          
          console.log('[Realtime] Проверка прочитанности:', {
            read: readValue,
            is_read: isReadValue,
            readType: typeof readValue,
            isReadType: typeof isReadValue,
            isUnread: isUnread,
            willShowToast: isUnread
          })
          
          if (isUnread) {
            console.log('[Realtime] ✅ ПОКАЗЫВАЕМ TOAST для уведомления:', newNotification.id)
            console.log('[Realtime] Данные для toast:', {
              id: newNotification.id,
              message: newNotification.message,
              payload: newNotification.payload
            })
            
            // Проверяем, включены ли уведомления
            if (!areNotificationsEnabled()) {
              console.log('[Realtime] Уведомления отключены в настройках, toast не показываем')
              return
            }
            
            // Добавляем toast сразу
            console.log('[Realtime] Вызываем setCurrentToasts для добавления toast')
            setCurrentToasts(prev => {
              console.log('[Realtime] setCurrentToasts callback вызван. Текущее количество toast\'ов:', prev.length)
              // Проверяем, нет ли уже такого уведомления
              const exists = prev.some(t => String(t.id) === String(newNotification.id))
              if (exists) {
                console.log('[Realtime] Toast для этого уведомления уже отображается, пропускаем')
                return prev
              }
              console.log('[Realtime] Добавляем toast. Было:', prev.length, 'станет:', prev.length + 1)
              // Добавляем новое уведомление в конец и оставляем только последние MAX_TOASTS
              const newToasts = [...prev, newNotification]
              const result = newToasts.slice(-MAX_TOASTS)
              console.log('[Realtime] ✅ Toast добавлен! Итого toast\'ов:', result.length)
              console.log('[Realtime] ID добавленного toast:', newNotification.id)
              console.log('[Realtime] Данные toast:', { id: newNotification.id, message: newNotification.message })
              return result
            })
          } else {
            console.log('[Realtime] ❌ Уведомление уже прочитано, toast не показываем. read:', readValue, 'is_read:', isReadValue)
          }
        } else {
          console.warn('[Realtime] ⚠️ payload.new отсутствует')
        }
        console.log('[Realtime] ==========================================')
      })
      .subscribe((status, err) => {
        console.log('[Realtime] Статус подписки на notifications:', status, err ? 'ошибка:' : '', err)
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] ✅ Подписка на notifications активна для user_id:', logistId)
          console.log('[Realtime] ✅ Real-time подписка готова к получению уведомлений')
          console.log('[Realtime] ✅ Фильтр: user_id=eq.' + logistId)
          console.log('[Realtime] ✅ Канал:', notificationsChannel.topic)
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[Realtime] ❌ Ошибка подписки на notifications:', err)
        } else if (status === 'TIMED_OUT') {
          console.error('[Realtime] ❌ Таймаут подписки на notifications')
        } else if (status === 'CLOSED') {
          console.warn('[Realtime] ⚠️ Подписка на notifications закрыта')
        } else {
          console.warn('[Realtime] ⚠️ Неизвестный статус подписки на notifications:', status)
        }
      })

    realtimeChannelsRef.current.push(notificationsChannel)

    console.log("[initRealtimeSubscriptions] Подписки созданы:", realtimeChannelsRef.current.length)
    console.log("[initRealtimeSubscriptions] ✅ Подписка на notifications создана для user_id:", logistId)
    console.log("[initRealtimeSubscriptions] Фильтр подписки: user_id=eq." + logistId)
  }, [userId, loadUserOrders, loadUserBalance, cleanupRealtimeSubscriptions])

  const setCurrentChatOrderId = useCallback((orderId) => {
    currentChatOrderIdRef.current = orderId ? Number(orderId) : null
    console.log('[AppContext] setCurrentChatOrderId:', currentChatOrderIdRef.current)
  }, [])

  const setCurrentModalOrderId = useCallback((orderId) => {
    currentModalOrderIdRef.current = orderId ? Number(orderId) : null
    console.log('[AppContext] setCurrentModalOrderId:', currentModalOrderIdRef.current)
  }, [])

  const setLoadMessages = useCallback((loadFn) => {
    loadMessagesRef.current = loadFn
    console.log('[AppContext] setLoadMessages установлен')
  }, [])

  const setLoadResponses = useCallback((loadFn) => {
    loadResponsesRef.current = loadFn
    console.log('[AppContext] setLoadResponses установлен')
  }, [])

  const setRefreshChat = useCallback((refreshFn) => {
    refreshChatRef.current = refreshFn
    console.log('[AppContext] setRefreshChat установлен:', typeof refreshFn, refreshFn ? 'function' : 'null')
  }, [])

  const setRefreshChatCallback = useCallback((callback) => {
    refreshChatCallbackRef.current = callback
    console.log('[AppContext] setRefreshChatCallback установлен:', typeof callback, callback ? 'function' : 'null')
  }, [])

  const setAddMessageToChat = useCallback((callback) => {
    addMessageToChatRef.current = callback
    console.log('[AppContext] setAddMessageToChat установлен:', typeof callback, callback ? 'function' : 'null')
  }, [])

  const setUpdateResponseInModal = useCallback((callback) => {
    updateResponseInModalRef.current = callback
    console.log('[AppContext] setUpdateResponseInModal установлен:', typeof callback, callback ? 'function' : 'null')
  }, [])

  // Функции для показа модалок подтверждения и уведомлений
  const showAlert = useCallback((title, message) => {
    return new Promise((resolve) => {
      setConfirmModal({
        isOpen: true,
        title,
        message,
        type: 'alert',
        confirmText: 'OK',
        onConfirm: () => {
          resolve(true)
          // Закрываем модалку после resolve
          setTimeout(() => {
            setConfirmModal(prev => ({ ...prev, isOpen: false }))
          }, 0)
        },
        onCancel: null
      })
    })
  }, [])

  const showConfirm = useCallback((title, message, confirmText = 'Подтвердить', cancelText = 'Отмена') => {
    return new Promise((resolve) => {
      setConfirmModal({
        isOpen: true,
        title,
        message,
        type: 'confirm',
        confirmText,
        cancelText,
        onConfirm: () => {
          resolve(true)
          // Закрываем модалку после resolve
          setTimeout(() => {
            setConfirmModal(prev => ({ ...prev, isOpen: false }))
          }, 0)
        },
        onCancel: () => {
          resolve(false)
          // Закрываем модалку после resolve
          setTimeout(() => {
            setConfirmModal(prev => ({ ...prev, isOpen: false }))
          }, 0)
        }
      })
    })
  }, [])

  const closeConfirmModal = useCallback(() => {
    setConfirmModal(prev => ({ ...prev, isOpen: false }))
  }, [])

  const setRefreshOrders = useCallback((refreshFn) => {
    refreshOrdersRef.current = refreshFn
    console.log('[AppContext] setRefreshOrders установлен:', typeof refreshFn, refreshFn ? 'function' : 'null')
  }, [])

  // Функции для работы с уведомлениями (объявляем раньше, чтобы использовать в initRealtimeSubscriptions)
  const loadNotifications = useCallback(async (silent = false) => {
    if (!userId) {
      console.warn("[loadNotifications] userId не установлен")
      return
    }

    try {
      const resp = await callApi({
        action: "getNotifications",
        user_id: userId
      })

      if (resp?.success && resp.notifications) {
        const newNotifications = resp.notifications || []
        const now = new Date()
        
        // Проверяем, есть ли новые непрочитанные уведомления
        setNotifications(prev => {
          const prevIds = new Set(prev.map(n => String(n.id)))
          
          // Находим новые непрочитанные уведомления
          // Упрощаем логику - проверяем только что уведомление новое и непрочитанное
          const newUnreadNotifications = newNotifications.filter(n => {
            const isNew = !prevIds.has(String(n.id))
            const isUnread = (n.read === false || n.read === null || n.read === undefined) && 
                            (n.is_read === false || n.is_read === null || n.is_read === undefined)
            
            // Убираем проверку времени для polling - если уведомление новое и непрочитанное, показываем его
            const shouldShow = isNew && isUnread
            
            if (shouldShow) {
              console.log('[loadNotifications] ✅ Найдено новое непрочитанное уведомление:', {
                id: n.id,
                message: n.message,
                read: n.read,
                is_read: n.is_read,
                isNew,
                isUnread
              })
            }
            
            return shouldShow
          })
          
          // Если есть новые непрочитанные уведомления, показываем toast для каждого нового
          if (newUnreadNotifications.length > 0 && !silent) {
            // Проверяем, включены ли уведомления
            if (!areNotificationsEnabled()) {
              console.log('[loadNotifications] Уведомления отключены в настройках, toast не показываем')
            } else {
              console.log('[loadNotifications] ✅ Найдено новых непрочитанных уведомлений:', newUnreadNotifications.length)
              newUnreadNotifications.forEach(n => {
                console.log('[loadNotifications] Новое уведомление:', n.id, n.message)
              })
              
              // Добавляем все новые уведомления в toast'ы
              setCurrentToasts(prev => {
              const existingIds = new Set(prev.map(t => String(t.id)))
              // Фильтруем только те, которых еще нет в текущих toast'ах
              const toAdd = newUnreadNotifications.filter(n => !existingIds.has(String(n.id)))
              
              if (toAdd.length > 0) {
                console.log('[loadNotifications] ✅ Добавляем', toAdd.length, 'новых toast\'ов')
                toAdd.forEach(n => {
                  console.log('[loadNotifications] Добавляем toast для уведомления:', n.id, n.message)
                })
                // Обновляем время последней проверки
                lastNotificationCheckRef.current = now
                // Добавляем новые в конец и оставляем только последние MAX_TOASTS
                const newToasts = [...prev, ...toAdd]
                const result = newToasts.slice(-MAX_TOASTS)
                console.log('[loadNotifications] ✅ Toast\'ы обновлены. Итого:', result.length)
                return result
              }
              
              console.log('[loadNotifications] Все новые уведомления уже отображаются')
              return prev
            })
            }
          } else if (!silent) {
            console.log('[loadNotifications] Новых непрочитанных уведомлений не найдено')
          }
          
          // Обновляем время последней проверки
          if (newNotifications.length > 0) {
            lastNotificationCheckRef.current = now
          }
          
          return newNotifications
        })
      } else {
        console.error("[loadNotifications] Ошибка:", resp?.error)
        setNotifications([])
      }
    } catch (error) {
      console.error("[loadNotifications] Исключение:", error)
      setNotifications([])
    }
  }, [userId, callApi])

  const markNotificationAsRead = useCallback(async (notificationId) => {
    if (!notificationId) return

    try {
      const resp = await callApi({
        action: "markNotificationAsRead",
        notification_id: notificationId
      })

      if (resp?.success) {
        // Обновляем локальное состояние
        setNotifications(prev => prev.map(n => 
          n.id === notificationId ? { ...n, read: true, is_read: true } : n
        ))
      } else {
        console.error("[markNotificationAsRead] Ошибка:", resp?.error)
      }
    } catch (error) {
      console.error("[markNotificationAsRead] Исключение:", error)
    }
  }, [callApi])

  const clearToasts = useCallback(() => {
    console.log('[AppContext] Очищаем все toast\'ы')
    setCurrentToasts([])
  }, [])

  // Слушаем событие отключения уведомлений
  useEffect(() => {
    const handleNotificationsDisabled = () => {
      console.log('[AppContext] Уведомления отключены, очищаем все toast\'ы')
      setCurrentToasts([])
      setHiddenToasts([])
    }
    
    if (typeof window !== 'undefined') {
      window.addEventListener('notificationsDisabled', handleNotificationsDisabled)
      return () => {
        window.removeEventListener('notificationsDisabled', handleNotificationsDisabled)
      }
    }
  }, [])

  const handleNotificationClick = useCallback((notification) => {
    const payload = notification.payload ? (typeof notification.payload === 'string' ? JSON.parse(notification.payload) : notification.payload) : {}
    const type = payload.type || notification.type

    // Обрабатываем клик в зависимости от типа
    if (type === 'new_response' || type === 'response_accepted' || type === 'order_confirmed' || type === 'new_message') {
      const orderId = payload.order_id
      if (orderId) {
        // Обновляем заказы перед открытием
        loadUserOrders().then(() => {
          // Переходим на страницу заказов и открываем модалку
          if (typeof window !== 'undefined') {
            // Сохраняем orderId в sessionStorage для открытия модалки
            sessionStorage.setItem('openOrderModal', orderId)
            // Переходим на страницу заказов
            if (window.location.pathname !== '/orders') {
              window.location.href = '/orders'
            } else {
              // Если уже на странице заказов, просто триггерим событие
              window.dispatchEvent(new CustomEvent('openOrderModal', { detail: { orderId } }))
            }
          }
        })
      }
    }
  }, [loadUserOrders])

  const retryInit = useCallback(async () => {
    const client = getSupabaseClient()
    if (!supabase) {
      setSupabase(client)
    }
    await initUser()
    // Ждем немного, чтобы Supabase клиент точно загрузился
    await new Promise(resolve => setTimeout(resolve, 1000))
    // Инициализируем real-time подписки
    console.log('[AppContext] Инициализация real-time подписок')
    initRealtimeSubscriptions(client)
    console.log('[AppContext] Инициализация завершена')
  }, [initUser, supabase])

  // Отдельный useEffect для инициализации real-time подписок при изменении userId
  useEffect(() => {
    if (!userId || !supabase) {
      console.log('[AppContext] userId или supabase не готовы для real-time подписок:', { userId, hasSupabase: !!supabase })
      return
    }
    
    console.log('[AppContext] userId установлен, инициализируем real-time подписки для userId:', userId)
    initRealtimeSubscriptions(supabase)
    
    return () => {
      console.log('[AppContext] Очистка real-time подписок при изменении userId')
      cleanupRealtimeSubscriptions(supabase)
    }
  }, [userId, supabase, initRealtimeSubscriptions, cleanupRealtimeSubscriptions])

  useEffect(() => {
    const client = getSupabaseClient()
    setSupabase(client)
    
    const initialize = async () => {
      console.log('[AppContext] Начало инициализации')
      
      // Инициализируем Telegram WebApp если доступен
      if (isRunningInTelegram()) {
        console.log('[AppContext] Обнаружен Telegram WebApp, инициализируем...')
        const telegramInitialized = initTelegramWebApp()
        if (telegramInitialized) {
          console.log('[AppContext] Telegram WebApp инициализирован успешно')
          
          // Обновляем userId если Telegram ID стал доступен
          const userIdUpdated = updateUserIdFromTelegram()
          if (userIdUpdated) {
            console.log('[AppContext] userId обновлен из Telegram')
          }
          
          // Получаем данные пользователя из Telegram
          const telegramUser = getTelegramUser()
          if (telegramUser) {
            console.log('[AppContext] Данные пользователя из Telegram:', telegramUser)
            // Обновляем имя пользователя если оно доступно
            if (telegramUser.full_name) {
              setUserName(telegramUser.full_name)
            }
          }
        }
      } else {
        console.log('[AppContext] Приложение запущено вне Telegram')
      }
      
      await initUser()
      console.log('[AppContext] Данные пользователя загружены')
      
      // Если была ошибка, не продолжаем инициализацию
      if (error) {
        return
      }
      
      // Проверяем все хранилища на наличие незавершенных модалок завершения заказов
      console.log('[AppContext] Проверяем все хранилища на незавершенные модалки')
      const allKeys = new Set()
      
      // localStorage
      try {
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('finalize_order_')) allKeys.add(key)
        })
      } catch (e) {
        console.error('[AppContext] Ошибка чтения localStorage:', e)
      }
      
      // cookies
      try {
        document.cookie.split(';').forEach(cookie => {
          const name = cookie.split('=')[0].trim()
          if (name.startsWith('finalize_order_')) allKeys.add(name)
        })
      } catch (e) {
        console.error('[AppContext] Ошибка чтения cookies:', e)
      }
      
      // sessionStorage
      try {
        Object.keys(sessionStorage).forEach(key => {
          if (key.startsWith('finalize_order_')) allKeys.add(key)
        })
      } catch (e) {
        console.error('[AppContext] Ошибка чтения sessionStorage:', e)
      }
      
      const storageKeys = Array.from(allKeys)
      if (storageKeys.length > 0) {
        console.log('[AppContext] ⚠️ Найдены незавершенные модалки завершения во всех хранилищах:', storageKeys)
        // Отправляем событие для уведомления компонентов
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('pendingFinalizeModal', { 
            detail: { keys: storageKeys } 
          }))
        }, 3000) // Даем время компонентам загрузиться
      }
      
      // Небольшая задержка для установки подписки перед загрузкой уведомлений
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Загружаем уведомления (real-time подписки будут созданы через отдельный useEffect)
      await loadNotifications(false) // false = не silent, чтобы показать toast для новых
      console.log('[AppContext] Инициализация завершена')
    }
    
    initialize()
    
    // Polling для проверки новых уведомлений каждые 2 секунды (основной механизм, так как real-time может не работать)
    const notificationsPollingInterval = setInterval(async () => {
      console.log('[AppContext] Polling: проверяем новые уведомления')
      await loadNotifications(false) // false = не silent, чтобы показать toast для новых
    }, 2000) // Проверяем каждые 2 секунды для более быстрого отклика
    
    // Polling для проверки обновления Telegram ID каждые 5 секунд
    const telegramPollingInterval = setInterval(() => {
      if (isRunningInTelegram()) {
        const userIdUpdated = updateUserIdFromTelegram()
        if (userIdUpdated) {
          console.log('[AppContext] Polling: userId обновлен из Telegram')
        }
      }
    }, 5000) // Проверяем каждые 5 секунд

    return () => {
      console.log('[AppContext] Очистка при размонтировании')
      cleanupRealtimeSubscriptions(client)
      if (notificationsPollingInterval) {
        clearInterval(notificationsPollingInterval)
      }
      if (telegramPollingInterval) {
        clearInterval(telegramPollingInterval)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Показываем загрузку или ошибку вместо контента
  // НЕ показываем ошибку, если открыта модалка регистрации
  if (isLoading && !isRegistrationModalOpen) {
    return <LoadingScreen />
  }

  if (error && !isRegistrationModalOpen) {
    return (
      <ErrorScreen 
        error={error} 
        isNetworkError={isNetworkError}
        onRetry={retryInit}
      />
    )
  }

  return (
    <AppContext.Provider value={{
      userId,
      userName,
      setUserName,
      profile,
      setProfile,
      orders: orders || [],
      setOrders,
      balance: balance || { available: "0₽" },
      setBalance,
      operations: operations || [],
      setOperations,
      profile: profile || {
        subscription_tier: null,
        daily_collected_count: 0,
        rating: null,
        characteristics: null
      },
      currentOrderFilter,
      setCurrentOrderFilter,
      supabase,
      callApi,
      loadUserBalance,
      loadUserOrders,
      setCurrentChatOrderId,
      setCurrentModalOrderId,
      setLoadMessages,
      setLoadResponses,
      setRefreshChat,
      setRefreshChatCallback,
      setAddMessageToChat,
      setUpdateResponseInModal,
      showAlert,
      showConfirm,
      notifications,
      loadNotifications,
      markNotificationAsRead,
      handleNotificationClick,
      clearToasts,
      setIsAnyModalOpen,
      unreadNotificationsCount: notifications.filter(n => !n.read && !n.is_read).length,
      setIsRegistrationModalOpen,
      updateUserIdFromTelegram,
      isRunningInTelegram: isRunningInTelegram(),
      telegramUser: getTelegramUser()
    }}>
      {children}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={closeConfirmModal}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.type}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        onConfirm={confirmModal.onConfirm}
        onCancel={confirmModal.onCancel}
      />
      {currentToasts.length > 0 && areNotificationsEnabled() && (
        <div style={{
          position: 'fixed',
          bottom: '80px',
          right: '16px',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          alignItems: 'flex-end'
        }}>
          {currentToasts.map((toast, index) => (
            <NotificationToast
              key={toast.id}
              notification={toast}
              onClick={() => {
                console.log('[AppContext] Toast кликнут, открываем модалку уведомлений')
                setIsNotificationsModalOpen(true)
                // Все toast'ы закроются автоматически через useEffect при открытии модалки
              }}
              onClose={() => {
                console.log('[AppContext] Toast закрыт:', toast.id)
                setCurrentToasts(prev => prev.filter(t => t.id !== toast.id))
              }}
            />
          ))}
        </div>
      )}
      <NotificationsModal
        isOpen={isNotificationsModalOpen}
        onClose={() => setIsNotificationsModalOpen(false)}
      />
      <RegistrationModal
        isOpen={isRegistrationModalOpen}
        onClose={() => {
          setIsRegistrationModalOpen(false)
          // Обновляем isAnyModalOpen только если нет других открытых модалок
          setIsAnyModalOpen(false)
        }}
      />
    </AppContext.Provider>
  )
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used within AppProvider')
  }
  return context
}

