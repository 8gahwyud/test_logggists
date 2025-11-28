'use client'

import { useApp } from '@/lib/AppContext'
import styles from './ProfileFinance.module.css'

export default function ProfileFinance({ onFinanceClick }) {
  const { balance, operations } = useApp()

  return (
    <div className={styles.finance}>
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
            {operations.slice(0, 5).map((op, index) => (
              <div key={index} className={styles.operationItem}>
                <div className={styles.operationInfo}>
                  <p className={styles.operationTitle}>{op.description || 'Операция'}</p>
                  <p className={styles.operationDate}>
                    {new Date(op.created_at).toLocaleDateString('ru-RU')}
                  </p>
                </div>
                <p className={`${styles.operationAmount} ${Number(op.amount || 0) < 0 ? styles.expense : styles.income}`}>
                  {Number(op.amount || 0) > 0 ? '+' : ''}{op.amount}₽
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <button className={styles.financeBtn} onClick={onFinanceClick}>
        Подробнее о финансах
      </button>
    </div>
  )
}



