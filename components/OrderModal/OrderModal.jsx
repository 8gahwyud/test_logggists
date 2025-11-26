'use client'

import { useState, useEffect, useCallback } from 'react'
import { useApp } from '@/lib/AppContext'
import OrderChatModal from '../OrderChatModal/OrderChatModal'
import styles from './OrderModal.module.css'

export default function OrderModal({ order, onClose, onUpdate, onModalStateChange }) {
  const { callApi, profile, userId, setCurrentModalOrderId, setLoadResponses, setUpdateResponseInModal, showAlert, showConfirm, loadUserOrders, setIsAnyModalOpen } = useApp()
  // Если заказ в работе, сразу показываем вкладку "В работе"
  const [activeTab, setActiveTab] = useState(() => {
    return order?.status === 'in_progress' ? 'working' : 'pending'
  })
  const [responses, setResponses] = useState([])
  const [loading, setLoading] = useState(false) // Не показываем загрузку при открытии
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [userDataCache, setUserDataCache] = useState({}) // Кэш для данных пользователей
  const [flippedRatings, setFlippedRatings] = useState(new Set()) // Отслеживаем перевернутые рейтинги

  useEffect(() => {
    if (onModalStateChange) {
      onModalStateChange(true) // OrderModal всегда открыт, когда отображается
    }
    // Уведомляем AppContext об открытии модалки
    if (setIsAnyModalOpen) {
      setIsAnyModalOpen(true)
    }
    // Блокируем прокрутку body
    document.body.style.overflow = 'hidden'
    return () => {
      if (onModalStateChange && !isChatOpen) {
        onModalStateChange(false)
      }
      // Уведомляем AppContext о закрытии модалки
      if (setIsAnyModalOpen && !isChatOpen) {
        setIsAnyModalOpen(false)
      }
      // Разблокируем прокрутку body
      document.body.style.overflow = ''
    }
  }, [onModalStateChange, isChatOpen, setIsAnyModalOpen])

  // Обработка события открытия чата из уведомлений
  useEffect(() => {
    const handleOpenChat = () => {
      if (order && !isChatOpen) {
        setIsChatOpen(true)
      }
    }
    
    window.addEventListener('openOrderChat', handleOpenChat)
    
    return () => {
      window.removeEventListener('openOrderChat', handleOpenChat)
    }
  }, [order, isChatOpen])

  const loadResponses = useCallback(async (silent = false) => {
    if (!order?.id) return
    
    if (!silent) {
      setLoading(true)
    }
    try {
      const resp = await callApi({
        action: "getOrderResponses",
        order_id: order.id
      })

      if (resp?.success) {
        console.log("[loadResponses] Получены ответы:", resp.responses)
        console.log("[loadResponses] Первый ответ детально:", resp.responses?.[0] ? JSON.stringify(resp.responses[0], null, 2) : 'нет ответов')
        const responsesData = resp.responses || []
        
        // Загружаем данные пользователей отдельно, если они не пришли
        const userIdsToLoad = responsesData
          .filter(r => !r.users && r.user_id)
          .map(r => r.user_id)
        
        if (userIdsToLoad.length > 0) {
          console.log("[loadResponses] Загружаем данные пользователей отдельно:", userIdsToLoad)
          const userDataPromises = userIdsToLoad.map(async (userId) => {
            try {
              const userResp = await callApi({
                action: "getUserByTelegramId",
                telegram_id: userId
              })
              if (userResp?.success && userResp?.user) {
                return { userId, user: userResp.user }
              }
            } catch (error) {
              console.error(`[loadResponses] Ошибка загрузки пользователя ${userId}:`, error)
            }
            return null
          })
          
          const loadedUsers = await Promise.all(userDataPromises)
          const newCache = {}
          loadedUsers.forEach(item => {
            if (item) {
              newCache[item.userId] = item.user
            }
          })
          
          if (Object.keys(newCache).length > 0) {
            setUserDataCache(prev => ({ ...prev, ...newCache }))
          }
        }
        
        setResponses(responsesData)
      }
    } catch (error) {
      console.error("[loadResponses] Ошибка:", error)
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [order?.id, callApi])

  useEffect(() => {
    if (order) {
      // Загружаем данные сразу при открытии, но без показа загрузки
      loadResponses(true)
    }
  }, [order?.id, loadResponses])
  
  // Обновляем активную вкладку при изменении статуса заказа или когда заказ переходит в работу
  useEffect(() => {
    const isOrderInProgress = order?.status === 'in_progress' || order?.status === 'working'
    
    // Проверяем, достаточно ли подтвержденных исполнителей для перехода заказа в работу
    const workingEmployees = responses.filter(r => r.status === 'working' || r.status === 'in_progress' || r.status === 'confirmed')
    const requiredSlots = order?.required_slots || 1
    const isOrderFull = workingEmployees.length >= requiredSlots
    
    // Если заказ в статусе "в работе" или достаточно подтвержденных исполнителей, переключаемся на вкладку "В работе"
    if (isOrderInProgress || isOrderFull) {
      setActiveTab(prevTab => {
        if (prevTab !== 'working') {
          console.log('[OrderModal] Заказ перешел в работу, переключаемся на вкладку "В работе"')
          return 'working'
        }
        return prevTab
      })
    }
  }, [order?.status, responses, order?.required_slots])

  // Polling для обновления откликов (как в оригинале - каждые 2 секунды)
  useEffect(() => {
    if (!order?.id) return

    console.log('[OrderModal] Запускаем polling для откликов заказа:', order.id)
    
    const intervalId = setInterval(() => {
      console.log('[OrderModal] Polling: проверяем обновления откликов (silent)')
      loadResponses(true) // Тихая загрузка без показа индикатора
    }, 2000) // 2 секунды, как в оригинале

    return () => {
      console.log('[OrderModal] Останавливаем polling')
      clearInterval(intervalId)
    }
  }, [order?.id, loadResponses])

  // Настраиваем real-time обновления для откликов
  useEffect(() => {
    if (!order?.id) return

    console.log('[OrderModal] Настраиваем real-time для заказа:', order.id)
    
    // Устанавливаем текущий orderId для real-time
    if (setCurrentModalOrderId) {
      setCurrentModalOrderId(order.id)
    }
    
    // Устанавливаем функцию загрузки откликов
    if (setLoadResponses) {
      setLoadResponses(loadResponses)
    }

    // Устанавливаем функцию для бесшовного обновления отклика
    if (setUpdateResponseInModal) {
      const updateResponse = (updatedResponse) => {
        if (!updatedResponse) return
        
        console.log('[OrderModal] Обновляем отклик бесшовно:', updatedResponse.id)
        // Используем функциональное обновление для минимального перерендера
        setResponses(prev => {
          const responseId = updatedResponse.id
          if (responseId) {
            const existingIndex = prev.findIndex(resp => resp.id && String(resp.id) === String(responseId))
            if (existingIndex !== -1) {
              // Обновляем существующий отклик - создаем новый массив только с измененным элементом
              const newArray = [...prev]
              newArray[existingIndex] = updatedResponse
              return newArray
            } else {
              // Добавляем новый отклик, если его еще нет
              return [...prev, updatedResponse]
            }
          }
          return prev
        })
      }
      setUpdateResponseInModal(updateResponse)
    }

    return () => {
      console.log('[OrderModal] Очищаем real-time настройки')
      if (setCurrentModalOrderId) {
        setCurrentModalOrderId(null)
      }
      if (setLoadResponses) {
        setLoadResponses(null)
      }
      if (setUpdateResponseInModal) {
        setUpdateResponseInModal(null)
      }
    }
  }, [order?.id, setCurrentModalOrderId, setLoadResponses, setUpdateResponseInModal, loadResponses])

  const handleEmployeeAction = async (responseId, action) => {
    try {
      // Как в оригинале - используем updateResponseStatus
      let newStatus
      if (action === 'accept') {
        newStatus = 'accepted'
      } else if (action === 'reject') {
        // Для отклонения используем отдельный action
        const resp = await callApi({
          action: "rejectResponse",
          response_id: responseId,
          order_id: order.id,
          logist_id: userId
        })
        
        if (resp?.success) {
          await loadResponses()
          if (onUpdate) onUpdate()
        } else {
          console.error("[handleEmployeeAction] Ошибка отклонения:", resp?.error)
          await showAlert("Ошибка", "Ошибка при отклонении исполнителя: " + (resp?.error || "Неизвестная ошибка"))
        }
        return
      } else {
        console.error("[handleEmployeeAction] Неизвестное действие:", action)
        return
      }

      const confirmed = await showConfirm(
        "Подтверждение",
        "Вы уверены, что хотите принять этого исполнителя?",
        "Принять",
        "Отмена"
      )
      if (!confirmed) {
        return
      }

      const resp = await callApi({
        action: "updateResponseStatus",
        response_id: responseId,
        order_id: order.id,
        status: newStatus
      })

      if (resp?.success) {
        await loadResponses()
        if (onUpdate) onUpdate()
      } else {
        console.error("[handleEmployeeAction] Ошибка:", resp?.error)
        await showAlert("Ошибка", "Ошибка при принятии исполнителя: " + (resp?.error || "Неизвестная ошибка"))
      }
    } catch (error) {
      console.error("[handleEmployeeAction] Ошибка:", error)
      await showAlert("Ошибка", "Ошибка при выполнении действия: " + (error.message || "Неизвестная ошибка"))
    }
  }

  const handleConfirmEmployee = async (responseId) => {
    try {
      const confirmed = await showConfirm(
        "Подтверждение",
        "Вы уверены, что хотите подтвердить этого исполнителя?",
        "Подтвердить",
        "Отмена"
      )
      if (!confirmed) {
        return
      }

      // Как в оригинале - используем updateResponseStatus
      const resp = await callApi({
        action: "updateResponseStatus",
        response_id: responseId,
        order_id: order.id,
        status: 'confirmed'
      })

      if (resp?.success) {
        await loadResponses()
        if (onUpdate) onUpdate()
      } else {
        console.error("[handleConfirmEmployee] Ошибка:", resp?.error)
        await showAlert("Ошибка", "Ошибка при подтверждении исполнителя: " + (resp?.error || "Неизвестная ошибка"))
      }
    } catch (error) {
      console.error("[handleConfirmEmployee] Ошибка:", error)
      await showAlert("Ошибка", "Ошибка при подтверждении исполнителя: " + (error.message || "Неизвестная ошибка"))
    }
  }

  const handleCompleteOrder = async () => {
    try {
      console.log("[handleCompleteOrder] Загрузка данных для завершения заказа:", order.id)
      const resp = await callApi({
        action: 'finalizeOrder',
        order_id: order.id,
        logist_id: userId
      })

      console.log("[handleCompleteOrder] Ответ сервера:", resp)
      
      if (resp?.success && resp?.participants) {
        // Рассчитываем сумму на человека
        const totalAmount = Number(order.collected_amount || 0) || 
                          (Number(order.wage_per_hour || 0) * Number(order.duration_hours || 0) * Number(order.required_slots || 1))
        const perPersonAmount = totalAmount / (resp.participants.length || 1)
        
        const finalizeOrderData = {
          order_id: order.id,
          logist_id: userId,
          total_amount: totalAmount,
          participants: resp.participants.map(p => ({
            ...p,
            payment_amount: perPersonAmount
          })),
          date: new Date().toLocaleDateString('ru-RU')
        }
        
        // Сохраняем данные в localStorage - OrdersPage подхватит их
        localStorage.setItem('finalize_modal_data', JSON.stringify(finalizeOrderData))
        console.log('[OrderModal] ✅ Данные модалки сохранены в localStorage, OrdersPage откроет модалку')
      } else {
        await showAlert("Ошибка", resp?.error || "Не удалось загрузить данные для завершения заказа")
      }
    } catch (error) {
      console.error("[handleCompleteOrder] Ошибка:", error)
      await showAlert("Ошибка", "Ошибка при загрузке данных: " + (error.message || "Неизвестная ошибка"))
    }
  }


  // Функция расчета штрафа за отмену заказа
  const calculateCancellationPenalty = (order, workingEmployees) => {
    const totalAmount = Number(order.wage_per_hour || 0) * Number(order.duration_hours || 0) * Number(order.required_slots || 1)
    
    // Если заказ не набрался (нет исполнителей в работе) - без штрафа
    if (!workingEmployees || workingEmployees.length === 0) {
      return {
        penalty: 0,
        reason: 'Заказ не набрался',
        compensationPerEmployee: 0
      }
    }
    
    // Проверяем время до начала заказа
    const now = new Date()
    const startTime = new Date(order.start_time)
    const hoursUntilStart = (startTime - now) / (1000 * 60 * 60)
    
    let penaltyPercent = 0
    let reason = ''
    
    if (hoursUntilStart < 3) {
      // Меньше 3 часов - 30% (10% нам, 20% исполнителям)
      penaltyPercent = 30
      reason = 'Менее 3 часов до начала'
    } else if (hoursUntilStart < 12) {
      // Меньше 12 часов - 20% (10% нам, 10% исполнителям)
      penaltyPercent = 20
      reason = 'Менее 12 часов до начала'
    } else {
      // Больше 12 часов - 10% (10% нам)
      penaltyPercent = 10
      reason = 'Заказ набрался'
    }
    
    const penalty = Math.round(totalAmount * penaltyPercent / 100)
    
    // Компенсация исполнителям
    let compensationPerEmployee = 0
    if (hoursUntilStart < 3) {
      // 20% от общей суммы делим на количество исполнителей
      compensationPerEmployee = Math.round(totalAmount * 20 / 100 / workingEmployees.length)
    } else if (hoursUntilStart < 12) {
      // 10% от общей суммы делим на количество исполнителей
      compensationPerEmployee = Math.round(totalAmount * 10 / 100 / workingEmployees.length)
    }
    
    return {
      penalty,
      reason,
      compensationPerEmployee,
      hoursUntilStart: Math.round(hoursUntilStart * 10) / 10
    }
  }

  const handleCancelOrder = async () => {
    console.log("[handleCancelOrder] ========================================")
    console.log("[handleCancelOrder] Начало отмены заказа")
    console.log("[handleCancelOrder] order.id:", order?.id, "тип:", typeof order?.id)
    console.log("[handleCancelOrder] order.created_by:", order?.created_by, "тип:", typeof order?.created_by)
    console.log("[handleCancelOrder] userId:", userId, "тип:", typeof userId)
    console.log("[handleCancelOrder] order.status:", order?.status)
    
    // Рассчитываем штраф
    const penaltyInfo = calculateCancellationPenalty(order, workingEmployees)
    
    let confirmMessage = "Вы уверены, что хотите отменить заказ?"
    if (penaltyInfo.penalty > 0) {
      confirmMessage += `\n\nШтраф за отмену: ${penaltyInfo.penalty}₽`
      confirmMessage += `\nПричина: ${penaltyInfo.reason}`
      if (penaltyInfo.compensationPerEmployee > 0) {
        confirmMessage += `\nКомпенсация каждому исполнителю: ${penaltyInfo.compensationPerEmployee}₽`
      }
      if (penaltyInfo.hoursUntilStart !== undefined) {
        confirmMessage += `\nДо начала заказа: ${penaltyInfo.hoursUntilStart}ч`
      }
    }
    
    const confirmed = await showConfirm(
      "Подтверждение отмены",
      confirmMessage,
      "Отменить заказ",
      "Отмена"
    )
    console.log("[handleCancelOrder] Подтверждение получено:", confirmed)
    if (!confirmed) {
      console.log("[handleCancelOrder] Пользователь отменил действие")
      return
    }
    
    try {
      // Преобразуем userId в число, если это строка
      const logistId = typeof userId === 'string' ? Number(userId) : userId
      console.log("[handleCancelOrder] Отправка запроса на отмену заказа")
      console.log("[handleCancelOrder] Параметры запроса:", {
        action: "cancelOrderByLogist",
        order_id: order.id,
        logist_id: logistId,
        order_id_type: typeof order.id,
        logist_id_type: typeof logistId
      })
      
      const resp = await callApi({
        action: "cancelOrderByLogist",
        order_id: order.id,
        logist_id: logistId
      })

      console.log("[handleCancelOrder] Ответ сервера:", resp)
      console.log("[handleCancelOrder] resp.success:", resp?.success)
      console.log("[handleCancelOrder] resp.error:", resp?.error)
      
      if (resp?.success) {
        console.log("[handleCancelOrder] Заказ успешно отменен, ответ:", resp)
        let message = 'Заказ отменен.'
        if (resp.penalty) {
          message += `\nШтраф: ${resp.penalty}₽`
        }
        if (resp.perResponder) {
          message += `\nКомпенсация исполнителям: ${resp.perResponder}₽ каждому`
        }
        console.log("[handleCancelOrder] Показываем alert с сообщением:", message)
        await showAlert("Заказ отменен", message)
        console.log("[handleCancelOrder] Alert закрыт, обновляем заказы")
        // Обновляем список заказов
        if (loadUserOrders) {
          console.log("[handleCancelOrder] Вызываем loadUserOrders")
          await loadUserOrders()
        }
        if (onUpdate) {
          console.log("[handleCancelOrder] Вызываем onUpdate")
          onUpdate()
        }
        // Небольшая задержка перед закрытием, чтобы убедиться, что все модалки закрылись
        await new Promise(resolve => setTimeout(resolve, 100))
        console.log("[handleCancelOrder] Закрываем модалку")
        onClose()
        console.log("[handleCancelOrder] Модалка закрыта")
      } else {
        console.error("[handleCancelOrder] Ошибка отмены заказа:", resp)
        const errorMsg = resp?.error?.message || resp?.error || "Неизвестная ошибка"
        console.error("[handleCancelOrder] Текст ошибки:", errorMsg)
        await showAlert("Ошибка", 'Ошибка при отмене заказа: ' + errorMsg)
      }
    } catch (error) {
      console.error("[handleCancelOrder] Исключение при отмене заказа:", error)
      console.error("[handleCancelOrder] Stack trace:", error.stack)
      await showAlert("Ошибка", 'Ошибка при отмене заказа: ' + (error.message || "Неизвестная ошибка"))
    }
  }

  const pendingEmployees = responses.filter(r => r.status === 'pending')
  const acceptedEmployees = responses.filter(r => r.status === 'accepted')
  const workingEmployees = responses.filter(r => r.status === 'working' || r.status === 'in_progress' || r.status === 'confirmed')

  const requiredSlots = order?.required_slots || 1
  const isOrderFull = workingEmployees.length >= requiredSlots
  const isOrderInProgress = order?.status === 'in_progress' || order?.status === 'working'
  const canAccept = !isOrderFull
  
  // Если заказ в работе, скрываем вкладки "Отклики" и "Подтверждают"
  const showPendingTab = !isOrderInProgress
  const showAcceptedTab = !isOrderInProgress

  let employeesToShow = []
  if (activeTab === 'pending') {
    employeesToShow = pendingEmployees
  } else if (activeTab === 'accepted') {
    employeesToShow = acceptedEmployees
  } else if (activeTab === 'working') {
    employeesToShow = workingEmployees
  }

  return (
    <div className={styles.modal}>
      <div className={styles.overlay} onClick={onClose}></div>
      <div className={styles.content} onClick={(e) => e.stopPropagation()}>
        <div className={styles.handle}></div>
        
        <div className={styles.header}>
          <button className={styles.close} onClick={onClose}>&times;</button>
          <h2 className={styles.title}>Панель управления заказом</h2>
          <p className={styles.subtitle}>Управляйте исполнителями и чатом</p>
        </div>

        {/* Кнопки управления заказом */}
        {isOrderInProgress && isOrderFull ? (
          <div className={styles.orderActions}>
            <h3 className={styles.orderStatusTitle}>✅ Заказ выполняется</h3>
            <div className={styles.orderButtons}>
              <button className={styles.chatButton} onClick={() => setIsChatOpen(true)}>
                💬 Чат заказа
              </button>
              <button className={styles.completeButton} onClick={handleCompleteOrder}>
                ✅ Завершить
              </button>
              <button className={styles.cancelButton} onClick={handleCancelOrder}>
                🗑️ Отменить заказ
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.orderActions}>
            <button className={styles.cancelButton} onClick={handleCancelOrder}>
              🗑️ Отменить заказ
            </button>
          </div>
        )}

        <div className={styles.tabs}>
          {showPendingTab && (
            <button 
              className={`${styles.tab} ${activeTab === 'pending' ? styles.active : ''}`}
              onClick={() => setActiveTab('pending')}
            >
              Отклики ({pendingEmployees.length})
            </button>
          )}
          {showAcceptedTab && (
            <button 
              className={`${styles.tab} ${activeTab === 'accepted' ? styles.active : ''}`}
              onClick={() => setActiveTab('accepted')}
            >
              Подтверждают ({acceptedEmployees.length})
            </button>
          )}
          <button 
            className={`${styles.tab} ${activeTab === 'working' ? styles.active : ''}`}
            onClick={() => setActiveTab('working')}
          >
            В работе ({workingEmployees.length})
          </button>
        </div>

        <div className={styles.employees}>
          {loading ? (
            <p className={styles.empty}>Загрузка...</p>
          ) : employeesToShow.length === 0 ? (
            <p className={styles.empty}>
              {activeTab === 'pending' && 'Нет новых откликов'}
              {activeTab === 'accepted' && 'Никто не подтверждает'}
              {activeTab === 'working' && 'Никто не работает'}
            </p>
          ) : (
            employeesToShow.map(response => {
              // Используем данные из response.users или из кэша
              // Также проверяем rating напрямую в response, если он есть
              const employee = response.users || userDataCache[response.user_id]
              const responseRating = response.rating // rating может быть прямо в response
              console.log("[OrderModal] Response:", response)
              console.log("[OrderModal] Employee data:", employee)
              console.log("[OrderModal] Response rating:", responseRating)
              console.log("[OrderModal] UserDataCache:", userDataCache)
              
              // Если employee null, значит данные не загрузились - пробуем загрузить
              if (!employee && response.user_id) {
                console.warn("[OrderModal] Employee data is null for user_id:", response.user_id)
                // Загружаем данные пользователя асинхронно
                if (!userDataCache[response.user_id]) {
                  callApi({
                    action: "getUserByTelegramId",
                    telegram_id: response.user_id
                  }).then(userResp => {
                    if (userResp?.success && userResp?.user) {
                      setUserDataCache(prev => ({
                        ...prev,
                        [response.user_id]: userResp.user
                      }))
                    }
                  }).catch(err => {
                    console.error("[OrderModal] Ошибка загрузки пользователя:", err)
                  })
                }
              }
              
              // Используем username (name нет в таблице users)
              let employeeName = 'Исполнитель'
              if (employee) {
                if (employee.username && employee.username.trim()) {
                  employeeName = employee.username.trim()
                } else if (employee.telegram_id) {
                  employeeName = `Исполнитель ${employee.telegram_id}`
                }
              } else if (response.user_id) {
                // Fallback: показываем user_id если данных нет
                employeeName = `Исполнитель ${response.user_id}`
              }
              
              // Отображаем рейтинг так, как он приходит из базы (без преобразования)
              let rating = '0'
              
              if (responseRating !== undefined && responseRating !== null && responseRating !== 'null' && responseRating !== '') {
                // Используем rating из response как есть
                rating = String(responseRating).trim()
              } else if (employee?.rating !== undefined && employee?.rating !== null && employee?.rating !== 'null' && employee?.rating !== '') {
                // Fallback на rating из employee как есть
                rating = String(employee.rating).trim()
              } else if (employee?.characteristics?.result !== undefined && employee?.characteristics?.result !== null) {
                // Используем characteristics.result как есть
                rating = String(employee.characteristics.result).trim()
              }
              
              const avatarUrl = employee?.avatar_url || employee?.photo_url || '/img/new-desin/avatar.png'

              return (
                <div key={response.id} className={styles.employeeCard}>
                  <div className={styles.employeeAvatarBlock}>
                    <div className={styles.avatarWrapper}>
                      <img 
                        src={avatarUrl} 
                        alt="Avatar" 
                        className={styles.avatar}
                        onError={(e) => { e.target.src = '/img/new-desin/avatar.png' }}
                      />
                      <div className={styles.avatarCheck}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M20 6L9 17L4 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    </div>
                  </div>
                  
                  <div className={styles.employeeInfo}>
                    <p className={styles.employeeName}>{employeeName}</p>
                    <p className={styles.employeeStatus}>Надежный</p>
                    
                    <div className={styles.employeeStats}>
                      <div 
                        className={`${styles.statBoxBlue} ${styles.ratingFlipCard} ${flippedRatings.has(response.id) ? styles.flipped : ''}`}
                        onClick={() => {
                          setFlippedRatings(prev => {
                            const newSet = new Set(prev)
                            if (newSet.has(response.id)) {
                              newSet.delete(response.id)
                            } else {
                              newSet.add(response.id)
                            }
                            return newSet
                          })
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className={styles.ratingFlipCardFront}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '4px' }}>
                            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="white"/>
                          </svg>
                          <span>{rating}</span>
                        </div>
                        <div className={styles.ratingFlipCardBack}>
                          <span className={styles.ratingFlipText}>Это рейтинг исполнителя</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className={styles.employeeActions}>
                    {activeTab === 'working' && (
                      <div className={styles.workingBadge}>
                        ✅ Работает
                      </div>
                    )}
                    {/* Кнопка подтверждения убрана - подтверждает заказчик, не логист */}
                    {activeTab === 'pending' && canAccept && (
                      <>
                        <button 
                          className={styles.acceptButton}
                          onClick={() => handleEmployeeAction(response.id, 'accept')}
                        >
                          Принять
                        </button>
                        <button 
                          className={styles.rejectButton}
                          onClick={() => handleEmployeeAction(response.id, 'reject')}
                        >
                          Отклонить
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
      {isChatOpen && (
        <OrderChatModal 
          order={order} 
          onClose={() => setIsChatOpen(false)}
          onModalStateChange={onModalStateChange}
        />
      )}
    </div>
  )
}
