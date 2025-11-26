'use client'

import { useState, useEffect } from 'react'
import { useApp } from '@/lib/AppContext'
import styles from './FinalizeOrderModal.module.css'

export default function FinalizeOrderModal({ data, onClose, onComplete }) {
  // ВАЖНО: Эта модалка НЕ ДОЛЖНА закрываться до завершения заказа
  const { callApi, showAlert } = useApp()
  const [expandedPerformer, setExpandedPerformer] = useState(null)
  const [ratings, setRatings] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Простые ключи для localStorage
  const modalKey = 'finalize_modal_data'
  const ratingsKey = 'finalize_modal_ratings'
  const expandedKey = 'finalize_modal_expanded'
  

  // Простая инициализация с сохранением в localStorage
  useEffect(() => {
    console.log('[FinalizeOrderModal] Инициализация модалки для заказа:', data.order_id)
    
    // Сохраняем данные модалки в localStorage
    localStorage.setItem(modalKey, JSON.stringify(data))
    
    // Пытаемся восстановить оценки
    const savedRatings = localStorage.getItem(ratingsKey)
    const savedExpanded = localStorage.getItem(expandedKey)
    
    if (savedRatings) {
      try {
        const parsedRatings = JSON.parse(savedRatings)
        console.log('[FinalizeOrderModal] Восстанавливаем оценки:', parsedRatings)
        setRatings(parsedRatings)
      } catch (e) {
        console.error('[FinalizeOrderModal] Ошибка парсинга оценок:', e)
      }
    } else {
      // Инициализация пустых оценок
      console.log('[FinalizeOrderModal] Инициализируем пустые оценки')
      const initialRatings = {}
      data.participants.forEach(p => {
        initialRatings[p.telegram_id] = {
          result: 0,
          punctuality: 0,
          communication: 0
        }
      })
      setRatings(initialRatings)
      localStorage.setItem(ratingsKey, JSON.stringify(initialRatings))
    }
    
    if (savedExpanded) {
      try {
        const parsedExpanded = JSON.parse(savedExpanded)
        console.log('[FinalizeOrderModal] Восстанавливаем развернутого исполнителя:', parsedExpanded)
        setExpandedPerformer(parsedExpanded)
      } catch (e) {
        console.error('[FinalizeOrderModal] Ошибка парсинга expanded:', e)
      }
    }
  }, [data.order_id])

  const handlePerformerClick = (performerId) => {
    const newExpanded = expandedPerformer === performerId ? null : performerId
    setExpandedPerformer(newExpanded)
    // Сохраняем состояние в localStorage
    localStorage.setItem(expandedKey, JSON.stringify(newExpanded))
  }

  const handleRatingChange = (performerId, criterion, value) => {
    const newRatings = {
      ...ratings,
      [performerId]: {
        ...ratings[performerId],
        [criterion]: value
      }
    }
    setRatings(newRatings)
    // Сохраняем оценки в localStorage при каждом изменении
    console.log('[FinalizeOrderModal] Сохраняем оценки:', newRatings)
    localStorage.setItem(ratingsKey, JSON.stringify(newRatings))
  }

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      await showAlert("Скопировано", "Реквизиты скопированы в буфер обмена")
    } catch (err) {
      console.error("Ошибка копирования:", err)
    }
  }

  const allRated = data.participants.every(p => {
    const rating = ratings[p.telegram_id]
    return rating && 
           rating.result > 0 && 
           rating.punctuality > 0 && 
           rating.communication > 0
  })

  const handleComplete = async () => {
    if (!allRated) {
      await showAlert("Ошибка", "Необходимо оценить всех исполнителей")
      return
    }

    setIsSubmitting(true)
    try {
      // Сохраняем оценки
      const ratingsArray = data.participants.map(p => ({
        performer_id: p.telegram_id,
        result: ratings[p.telegram_id].result,
        punctuality: ratings[p.telegram_id].punctuality,
        communication: ratings[p.telegram_id].communication
      }))

      const saveResp = await callApi({
        action: "savePerformerRatings",
        order_id: data.order_id,
        logist_id: data.logist_id,
        ratings: ratingsArray
      })

      if (!saveResp?.success) {
        throw new Error(saveResp?.error || "Ошибка сохранения оценок")
      }

      // Завершаем заказ
      const completeResp = await callApi({
        action: "completeOrderAfterRating",
        order_id: data.order_id,
        logist_id: data.logist_id
      })

      if (!completeResp?.success) {
        throw new Error(completeResp?.error || "Ошибка завершения заказа")
      }

      // НЕ очищаем данные здесь - это делает OrdersPage после onComplete
      console.log('[FinalizeOrderModal] Заказ завершен успешно')
      
      onComplete()
      onClose()
    } catch (error) {
      console.error("[FinalizeOrderModal] Ошибка:", error)
      await showAlert("Ошибка", error.message || "Не удалось завершить заказ")
    } finally {
      setIsSubmitting(false)
    }
  }

  const getRatingStars = (performerId, criterion) => {
    const value = ratings[performerId]?.[criterion] || 0
    return Array.from({ length: 5 }, (_, i) => i + 1)
  }

  const getStatusLabel = (rating) => {
    if (rating >= 90) return "Отличный"
    if (rating >= 80) return "Хороший"
    if (rating >= 70) return "Надежный"
    if (rating >= 60) return "Средний"
    if (rating >= 50) return "Начинающий"
    return "Низкий"
  }

  // Блокируем закрытие модалки клавишей Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        console.log('[FinalizeOrderModal] Попытка закрыть модалку клавишей Escape заблокирована')
      }
    }
    
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [])

  // Блокируем закрытие при попытке покинуть страницу
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      e.preventDefault()
      e.returnValue = 'У вас есть незавершенный заказ. Вы уверены, что хотите покинуть страницу?'
      return e.returnValue
    }
    
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  // Блокируем все попытки закрытия модалки
  useEffect(() => {
    // Блокируем прокрутку страницы под модалкой
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.width = '100%'
    
    return () => {
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.width = ''
    }
  }, [])

  return (
    <div className={styles.modal} style={{zIndex: 99999}}>
      {/* Полностью блокируем клики по overlay */}
      <div 
        className={styles.overlay}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          console.log('[FinalizeOrderModal] Попытка закрыть модалку кликом по overlay заблокирована')
        }}
      ></div>
      <div className={styles.content} onClick={(e) => e.stopPropagation()}>
        <div className={styles.handle}></div>
        
        <div className={styles.header}>
          <h2 className={styles.title}>⚠️ Завершение заказа</h2>
          <p className={styles.subtitle}>Переведите деньги и оцените исполнителей для завершения</p>
          <div style={{
            background: '#fff3cd',
            border: '1px solid #ffeaa7',
            borderRadius: '4px',
            padding: '8px 12px',
            fontSize: '12px',
            color: '#856404',
            marginTop: '8px'
          }}>
            ⚠️ Модалка не закрывается до полного завершения заказа
          </div>
        </div>

        <div className={styles.body}>
          {/* Общая сумма */}
          <div className={styles.totalCard}>
            <div className={styles.totalLeft}>
              <div className={styles.totalLabel}>Общая сумма</div>
              <div className={styles.totalDate}>{data.date}</div>
            </div>
            <div className={styles.totalRight}>
              <div className={styles.totalAmount}>{data.total_amount.toLocaleString('ru-RU')} ₽</div>
              <div className={styles.totalPeople}>{data.participants.length} человек</div>
            </div>
          </div>

          {/* Список исполнителей */}
          <div className={styles.performersList}>
            {data.participants.map((performer) => {
              const isExpanded = expandedPerformer === performer.telegram_id
              const performerRating = ratings[performer.telegram_id] || { result: 0, punctuality: 0, communication: 0 }
              const isRated = performerRating.result > 0 && performerRating.punctuality > 0 && performerRating.communication > 0

              return (
                <div key={performer.telegram_id} className={styles.performerCard}>
                  <div 
                    className={`${styles.performerHeader} ${isExpanded ? styles.expanded : ''}`}
                    onClick={() => handlePerformerClick(performer.telegram_id)}
                  >
                    <div className={styles.performerInfo}>
                      <div className={styles.performerAvatar}>
                        <img src="/img/new-desin/avatar.png" alt={performer.name} />
                        <div className={styles.verifiedBadge}>✓</div>
                      </div>
                      <div className={styles.performerDetails}>
                        <div className={styles.performerName}>{performer.name}</div>
                        <div className={styles.performerStatus}>{getStatusLabel(performer.rating || 50)}</div>
                      </div>
                    </div>
                    <div className={styles.performerPayment}>
                      <button className={styles.paymentButton}>
                        {performer.payment_amount.toLocaleString('ru-RU')} ₽
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className={styles.performerExpanded}>
                      {/* Реквизиты */}
                      {(performer.card_number || performer.phone_number) && (
                        <div className={styles.paymentDetails}>
                          {performer.card_number && (
                            <div className={styles.paymentMethod}>
                              <div className={styles.paymentInfo}>
                                <div className={styles.paymentNumber}>{performer.card_number}</div>
                                <div className={styles.paymentBank}>{performer.bank_name || 'Банк не указан'}</div>
                              </div>
                              <button 
                                className={styles.copyButton}
                                onClick={() => copyToClipboard(performer.card_number)}
                              >
                                📋
                              </button>
                            </div>
                          )}
                          {performer.phone_number && (
                            <div className={styles.paymentMethod}>
                              <div className={styles.paymentInfo}>
                                <div className={styles.paymentNumber}>{performer.phone_number}</div>
                                <div className={styles.paymentBank}>По номеру телефона ({performer.bank_name || 'Сбербанк'})</div>
                              </div>
                              <button 
                                className={styles.copyButton}
                                onClick={() => copyToClipboard(performer.phone_number)}
                              >
                                📋
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Оценка */}
                      <div className={styles.ratingSection}>
                        <div className={styles.ratingTitle}>Оцените исполнителя</div>
                        <div className={styles.ratingSubtitle}>По следующим критериям</div>
                        
                        {['result', 'punctuality', 'communication'].map((criterion) => {
                          const labels = {
                            result: 'Результативность',
                            punctuality: 'Пунктуальность',
                            communication: 'Коммуникабельность'
                          }
                          const value = performerRating[criterion] || 0

                          return (
                            <div key={criterion} className={styles.ratingItem}>
                              <div className={styles.ratingLabel}>{labels[criterion]}</div>
                              <div className={styles.stars}>
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <button
                                    key={star}
                                    className={`${styles.star} ${star <= value ? styles.active : ''}`}
                                    onClick={() => handleRatingChange(performer.telegram_id, criterion, star)}
                                  >
                                    ★
                                  </button>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Инструкция */}
          <div className={styles.instruction}>
            Чтобы завершить заказ вы должны перевести деньги и оценить каждого из исполнителей
          </div>
        </div>

        <div className={styles.footer}>
          <button 
            className={`${styles.completeButton} ${!allRated || isSubmitting ? styles.disabled : ''}`}
            onClick={handleComplete}
            disabled={!allRated || isSubmitting}
          >
            {isSubmitting ? 'Завершение...' : 'Завершить заказ'}
          </button>
        </div>
      </div>
    </div>
  )
}







