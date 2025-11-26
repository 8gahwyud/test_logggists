'use client'

import { useState, useEffect } from 'react'
import { useApp } from '@/lib/AppContext'
import ProfileOverview from './ProfileOverview'
import SubscriptionModal from '../SubscriptionModal/SubscriptionModal'
import SettingsModal from '../SettingsModal/SettingsModal'
import styles from './ProfilePage.module.css'

export default function ProfilePage({ onSubscriptionModalChange }) {
  const { orders, profile, balance } = useApp()
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)

  const activeOrdersCount = orders.filter(o => o.status !== "completed" && o.status !== "cancelled").length
  const totalOrdersCount = orders.length
  const successfulOrdersCount = orders.filter(o => o.status === "completed").length
  const cancelledOrdersCount = orders.filter(o => o.status === "cancelled").length

  // Используем информацию о подписке из базы данных
  const orderLimit = profile?.subscription?.order_limit || 5
  const availableOrders = Math.max(0, orderLimit - (profile?.daily_collected_count || 0))
  
  // Вычисляем время до сброса (следующая полночь)
  const getTimeUntilReset = () => {
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    return tomorrow.getTime() - now.getTime()
  }
  
  const [timeUntilReset, setTimeUntilReset] = useState(getTimeUntilReset())
  
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeUntilReset(getTimeUntilReset())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <main className={styles.main}>
      <ProfileOverview 
        onSubscriptionClick={() => setIsSubscriptionModalOpen(true)}
        onSettingsClick={() => setIsSettingsModalOpen(true)}
        subscriptionName={profile?.subscription?.name || 'Start (free)'}
        timeUntilReset={timeUntilReset}
        stats={{
          balance: balance.available || '0₽',
          activeOrders: activeOrdersCount,
          availableOrders: availableOrders,
          totalOrders: totalOrdersCount,
          successfulOrders: successfulOrdersCount,
          cancelledOrders: cancelledOrdersCount
        }}
      />
      {isSubscriptionModalOpen && (
        <SubscriptionModal 
          onClose={() => setIsSubscriptionModalOpen(false)}
          onModalStateChange={(isOpen) => {
            if (onSubscriptionModalChange) {
              onSubscriptionModalChange(isOpen)
            }
          }}
        />
      )}
      {isSettingsModalOpen && (
        <SettingsModal 
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          onModalStateChange={(isOpen) => {
            if (onSubscriptionModalChange) {
              onSubscriptionModalChange(isOpen)
            }
          }}
        />
      )}
    </main>
  )
}

