'use client'

import { useEffect } from 'react'
import { useApp } from '@/lib/AppContext'
import styles from './FinanceModal.module.css'
import { useSwipeToClose } from '@/hooks/useSwipeToClose'

export default function FinanceModal({ onClose }) {
  const { balance, operations, loadUserBalance } = useApp()
  const contentRef = useSwipeToClose(onClose, true)

  useEffect(() => {
    if (loadUserBalance) {
      loadUserBalance()
    }
    // Блокируем прокрутку body
    document.body.style.overflow = 'hidden'
    return () => {
      // Разблокируем прокрутку body
      document.body.style.overflow = ''
    }
  }, [loadUserBalance])

  const formatDate = (dateString) => {
    if (!dateString) return ''
    return new Date(dateString).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  }

  return (
    <div className={styles.modal}>
      <div className={styles.overlay} onClick={onClose}></div>
      <div ref={contentRef} className={styles.content} onClick={(e) => e.stopPropagation()}>
        <div className={styles.handle}></div>
        
        <div className={styles.header}>
          <button className={styles.close} onClick={onClose}>&times;</button>
          <h2 className={styles.title}>Финансы</h2>
          <p className={styles.subtitle}>Просмотрите чат заказов</p>
        </div>

        <div className={styles.cards}>
          <div className={styles.balanceCard}>
            <p className={styles.amount}>{balance.available || '0₽'}</p>
            <p className={styles.label}>Мой баланс</p>
          </div>
        </div>

        <div className={styles.operations}>
          <h3 className={styles.operationsTitle}>История операций</h3>
          {!operations || operations.length === 0 ? (
            <p className={styles.empty}>Нет операций</p>
          ) : (
            <div className={styles.operationsList}>
              {operations.map((op, index) => {
                const isExpense = Number(op.amount || 0) < 0
                const amount = Math.abs(Number(op.amount || 0))
                return (
                  <div key={index}>
                    <div className={styles.operationItem}>
                      <div className={styles.operationIcon}>
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path
                            d="M12 1V23M17 5H9.5C8.57174 5 7.6815 5.36875 7.02513 6.02513C6.36875 6.6815 6 7.57174 6 8.5C6 9.42826 6.36875 10.3185 7.02513 10.9749C7.6815 11.6313 8.57174 12 9.5 12H14.5C15.4283 12 16.3185 12.3687 16.9749 13.0251C17.6313 13.6815 18 14.5717 18 15.5C18 16.4283 17.6313 17.3185 16.9749 17.9749C16.3185 18.6313 15.4283 19 14.5 19H6"
                            stroke={isExpense ? '#FF5F57' : '#059669'}
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                      <div className={styles.operationInfo}>
                        <p className={styles.operationTitle}>{op.description || 'Операция'}</p>
                        <p className={styles.operationDate}>{formatDate(op.created_at)}</p>
                      </div>
                      <p className={`${styles.operationAmount} ${isExpense ? styles.expense : styles.income}`}>
                        {isExpense ? '-' : '+'}{amount}₽
                      </p>
                    </div>
                    {index < operations.length - 1 && <div className={styles.separator}></div>}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <button className={styles.topUpBtn}>
          Пополнить баланс
        </button>
      </div>
    </div>
  )
}

