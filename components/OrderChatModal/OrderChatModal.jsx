'use client'

import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react'
import { useApp } from '@/lib/AppContext'
import { normalizeUTCDate, formatTimeAgo, escapeHtml } from '@/lib/utils'
import styles from './OrderChatModal.module.css'

// Мемоизированный компонент сообщения - не перерендеривается если props не изменились
const MessageItem = memo(({ msg, isMyMessage, userId }) => {
  const formatDate = (dateString) => {
    if (!dateString) return ''
    const normalized = normalizeUTCDate(dateString)
    if (!normalized) return ''
    const date = new Date(normalized)
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  }

  const formatTime = (dateString) => {
    if (!dateString) return ''
    const normalized = normalizeUTCDate(dateString)
    if (!normalized) return ''
    const date = new Date(normalized)
    return date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const normalizedDate = normalizeUTCDate(msg.created_at)
  const messageDate = formatDate(normalizedDate)
  
  // Получаем имя пользователя из сообщения
  const userName = msg.user_name || msg.username || msg.users?.name || msg.users?.username || `ID: ${msg.user_id}`

  return (
    <>
      {msg.showDate && (
        <div className={styles.dateSeparator}>
          {messageDate}
        </div>
      )}
      <div className={`${styles.messageWrapper} ${isMyMessage ? styles.myMessage : styles.otherMessage}`}>
        {!isMyMessage && (
          <div className={styles.messageAuthor}>{escapeHtml(userName)}</div>
        )}
        <div className={`${styles.message} ${isMyMessage ? styles.myMessageBubble : styles.otherMessageBubble}`}>
          <div className={styles.messageText}>{escapeHtml(msg.message)}</div>
          <div className={styles.messageTime}>{formatTime(msg.created_at)}</div>
        </div>
      </div>
    </>
  )
})

MessageItem.displayName = 'MessageItem'

export default function OrderChatModal({ order, onClose, onModalStateChange }) {
  const { userId, callApi, setCurrentChatOrderId, setLoadMessages, setAddMessageToChat, showAlert, setIsAnyModalOpen } = useApp()
  const [messages, setMessages] = useState([])
  const [initialLoading, setInitialLoading] = useState(true) // Только для первой загрузки
  const [chatAvailable, setChatAvailable] = useState(true)
  const [messageText, setMessageText] = useState('')
  const messagesContainerRef = useRef(null)
  const hasLoadedRef = useRef(false) // Флаг первой загрузки

  // Определяем loadMessages ДО использования в useEffect
  const loadMessages = useCallback(async (silent = false) => {
    if (!order?.id) {
      console.warn('[loadMessages] order.id отсутствует')
      return
    }
    
    console.log('[loadMessages] Загрузка сообщений для заказа:', order.id, 'silent:', silent)
    const orderId = order.id // Сохраняем в локальную переменную для надежности
    
    // Показываем загрузку только при первой загрузке
    if (!silent && !hasLoadedRef.current) {
      setInitialLoading(true)
    }
    
    try {
      const resp = await callApi({
        action: "getOrderMessages",
        order_id: orderId
      })

      console.log('[loadMessages] Ответ API:', resp)
      if (resp?.success) {
        const newMessages = resp.messages || []
        console.log('[loadMessages] Получено сообщений:', newMessages.length)
        
        if (silent && hasLoadedRef.current) {
          // Тихая загрузка - добавляем только новые сообщения, не заменяя весь список
          setMessages(prev => {
            // Находим ID последнего сообщения в текущем списке
            const lastMessageId = prev.length > 0 ? prev[prev.length - 1]?.id : null
            
            // Находим индекс последнего сообщения в новом списке
            const lastIndex = lastMessageId 
              ? newMessages.findIndex(msg => msg.id && String(msg.id) === String(lastMessageId))
              : -1
            
            // Если нашли последнее сообщение, добавляем только те, что после него
            if (lastIndex >= 0 && lastIndex < newMessages.length - 1) {
              const newOnly = newMessages.slice(lastIndex + 1)
              console.log('[loadMessages] Добавляем только новые сообщения:', newOnly.length)
              return [...prev, ...newOnly]
            }
            
            // Если не нашли или список пустой - заменяем весь (на случай если порядок изменился)
            console.log('[loadMessages] Заменяем весь список (не найдено совпадение)')
            return newMessages
          })
        } else {
          // Первая загрузка - заменяем весь список
          console.log('[loadMessages] Обновляем состояние messages (первая загрузка)')
          setMessages(newMessages)
          hasLoadedRef.current = true
        }
        
        setChatAvailable(resp.chat_available !== false)
        console.log('[loadMessages] Состояние обновлено')
      }
    } catch (error) {
      console.error("[loadMessages] Ошибка:", error)
    } finally {
      if (!silent) {
        setInitialLoading(false)
      }
    }
  }, [order?.id, callApi])


  useEffect(() => {
    if (onModalStateChange) {
      onModalStateChange(true)
    }
    // Уведомляем AppContext об открытии модалки
    if (setIsAnyModalOpen) {
      setIsAnyModalOpen(true)
    }
    // Блокируем прокрутку body
    document.body.style.overflow = 'hidden'
    return () => {
      if (onModalStateChange) {
        onModalStateChange(false)
      }
      // Уведомляем AppContext о закрытии модалки
      if (setIsAnyModalOpen) {
        setIsAnyModalOpen(false)
      }
      // Разблокируем прокрутку body
      document.body.style.overflow = ''
    }
  }, [onModalStateChange, setIsAnyModalOpen])

  useEffect(() => {
    if (order) {
      hasLoadedRef.current = false // Сбрасываем флаг при смене заказа
      loadMessages(false) // Первая загрузка - показываем индикатор
    }
  }, [order?.id, loadMessages]) // Только при смене order.id

  // Polling для заказов в работе (как в оригинале - каждые 3 секунды)
  useEffect(() => {
    if (!order?.id) return
    
    // Запускаем polling только для заказов в статусе in_progress (как в оригинале)
    if (order.status !== 'in_progress' && order.status !== 'working') {
      return
    }

    console.log('[OrderChatModal] Запускаем polling для заказа в работе:', order.id)
    
    const intervalId = setInterval(() => {
      console.log('[OrderChatModal] Polling: проверяем новые сообщения (silent)')
      loadMessages(true) // Тихая загрузка без показа индикатора
    }, 3000) // 3 секунды, как в оригинале

    return () => {
      console.log('[OrderChatModal] Останавливаем polling')
      clearInterval(intervalId)
    }
  }, [order?.id, order?.status, loadMessages])

  // Настраиваем real-time обновления для сообщений (бесшовное добавление новых сообщений)
  useEffect(() => {
    if (!order?.id) return

    const orderIdNum = Number(order.id)
    console.log('[OrderChatModal] Настраиваем real-time для заказа:', orderIdNum)
    
    // Устанавливаем текущий orderId для real-time
    if (setCurrentChatOrderId) {
      setCurrentChatOrderId(orderIdNum)
    }
    
    // Устанавливаем функцию для бесшовного добавления нового сообщения
    if (setAddMessageToChat) {
      const addMessage = (newMessage) => {
        if (!newMessage) return
        
        console.log('[OrderChatModal] Добавляем новое сообщение бесшовно:', newMessage.id)
        // Используем функциональное обновление для минимального перерендера
        setMessages(prev => {
          // Проверяем, нет ли уже такого сообщения
          const messageId = newMessage.id
          if (messageId) {
            const existingIndex = prev.findIndex(msg => msg.id && String(msg.id) === String(messageId))
            if (existingIndex !== -1) {
              // Обновляем существующее (заменяем временное на реальное) - создаем новый массив только с измененным элементом
              const newArray = [...prev]
              newArray[existingIndex] = newMessage
              return newArray
            }
          }
          // Добавляем новое сообщение в конец - создаем новый массив только с добавлением
          return [...prev, newMessage]
        })
      }
      setAddMessageToChat(addMessage)
    }

    return () => {
      console.log('[OrderChatModal] Очищаем real-time настройки')
      if (setCurrentChatOrderId) {
        setCurrentChatOrderId(null)
      }
      if (setAddMessageToChat) {
        setAddMessageToChat(null)
      }
    }
  }, [order?.id, setCurrentChatOrderId, setAddMessageToChat])

  useEffect(() => {
    // Прокрутка вниз при изменении сообщений
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [messages])

  const sendMessage = async () => {
    if (!messageText.trim() || !order?.id || !userId) {
      console.warn("[sendMessage] Недостаточно данных:", { 
        hasMessage: !!messageText.trim(), 
        hasOrderId: !!order?.id, 
        hasUserId: !!userId,
        userId: userId,
        orderId: order?.id
      })
      return
    }

    const message = messageText.trim()
    
    // Проверяем, что все данные есть
    if (!message || !order?.id || !userId) {
      console.error("[sendMessage] Недостаточно данных для отправки:", {
        hasMessage: !!message,
        hasOrderId: !!order?.id,
        hasUserId: !!userId,
        message,
        orderId: order?.id,
        userId
      })
      return
    }
    
    // Передаем все параметры - API требует order_id, user_id и message
    // В оригинале передается только order_id и message, но API требует user_id
    // Попробуем передать все как строки (как в других местах кода)
    const orderIdStr = String(order.id)
    const userIdStr = String(userId)
    
    console.log("[sendMessage] Значения перед отправкой:", {
      orderIdStr,
      userIdStr,
      message,
      originalOrderId: order.id,
      originalUserId: userId
    })
    
    if (!orderIdStr || !userIdStr || !message) {
      console.error("[sendMessage] Некорректные данные:", {
        orderIdStr,
        userIdStr,
        message
      })
      await showAlert('Ошибка', 'Ошибка: некорректные данные для отправки сообщения')
      return
    }
    
    const payload = {
      action: "sendOrderMessage",
      order_id: orderIdStr,
      user_id: userIdStr,
      message: message
    }
    
    console.log("[sendMessage] Финальный payload:", payload)
    console.log("[sendMessage] JSON payload:", JSON.stringify(payload))

    console.log("[sendMessage] Отправка сообщения:", payload)
    console.log("[sendMessage] Типы данных:", {
      order_id: typeof payload.order_id,
      user_id: typeof payload.user_id,
      message: typeof payload.message,
      order_id_value: payload.order_id,
      user_id_value: payload.user_id,
      message_value: payload.message
    })

    try {
      const resp = await callApi(payload)

      console.log("[sendMessage] Ответ API:", resp)

      if (resp?.success) {
        setMessageText('')
        
        // Оптимистичное обновление - сразу добавляем сообщение в состояние
        // Используем функциональное обновление для минимального перерендера
        const optimisticMessage = {
          id: `temp_${Date.now()}`,
          order_id: order.id,
          user_id: userId,
          message: message,
          created_at: new Date().toISOString()
        }
        
        setMessages(prev => [...prev, optimisticMessage])
        
        // Real-time обновление придет позже и заменит временное сообщение на реальное
      } else {
        console.error("[sendMessage] Ошибка отправки:", resp?.error)
        await showAlert('Ошибка', 'Ошибка отправки сообщения: ' + (resp?.error || 'Неизвестная ошибка'))
      }
    } catch (error) {
      console.error("[sendMessage] Исключение:", error)
      await showAlert('Ошибка', 'Ошибка отправки сообщения: ' + (error.message || 'Неизвестная ошибка'))
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Мемоизируем обработку сообщений - пересчитывается только при изменении messages
  const messagesWithDates = useMemo(() => {
    // Сортируем сообщения по дате
    const sortedMessages = [...messages].sort((a, b) => {
      const normalizedA = normalizeUTCDate(a.created_at)
      const normalizedB = normalizeUTCDate(b.created_at)
      return new Date(normalizedA) - new Date(normalizedB)
    })

    // Добавляем флаги для отображения дат
    let lastDate = ''
    return sortedMessages.map(msg => {
      const normalizedDate = normalizeUTCDate(msg.created_at)
      const date = new Date(normalizedDate)
      const messageDate = date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
      const showDate = messageDate !== lastDate
      if (showDate) lastDate = messageDate
      return { ...msg, showDate, messageDate }
    })
  }, [messages])

  return (
    <div className={styles.modal}>
      <div className={styles.overlay} onClick={onClose}></div>
      <div className={styles.content} onClick={(e) => e.stopPropagation()}>
        <div className={styles.handle}></div>
        
        <div className={styles.header}>
          <button className={styles.close} onClick={onClose}>&times;</button>
          <h2 className={styles.title}>Чат заказа</h2>
          <p className={styles.subtitle}>Заказ #{order?.id}</p>
        </div>

        <div className={styles.messages} ref={messagesContainerRef}>
          {initialLoading ? (
            <p className={styles.empty}>Загрузка...</p>
          ) : messagesWithDates.length === 0 ? (
            <p className={styles.empty}>Нет сообщений</p>
          ) : (
            messagesWithDates.map((msg) => {
              const isMyMessage = Number(msg.user_id) === Number(userId)
              return (
                <MessageItem 
                  key={msg.id || `msg_${msg.created_at}_${msg.user_id}`} 
                  msg={msg} 
                  isMyMessage={isMyMessage}
                  userId={userId}
                />
              )
            })
          )}
        </div>

        <div className={styles.inputContainer}>
          <input
            type="text"
            className={styles.input}
            placeholder={chatAvailable ? 'Введите сообщение...' : 'Чат недоступен для этого заказа'}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={!chatAvailable}
          />
          <button
            className={styles.sendButton}
            onClick={sendMessage}
            disabled={!chatAvailable || !messageText.trim()}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22 2L11 13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

