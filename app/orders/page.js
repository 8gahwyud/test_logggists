'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/AppContext'
import Header from '@/components/Header/Header'
import BottomNav from '@/components/BottomNav/BottomNav'
import OrdersPage from '@/components/OrdersPage/OrdersPage'
import FinanceModal from '@/components/FinanceModal/FinanceModal'

export default function OrdersRoute() {
  const router = useRouter()
  const { balance, checkNegativeBalance } = useApp()
  const [isFinanceModalOpen, setIsFinanceModalOpen] = useState(false)
  const [isAnyModalOpen, setIsAnyModalOpen] = useState(false)

  useEffect(() => {
    setIsAnyModalOpen(isFinanceModalOpen)
  }, [isFinanceModalOpen])

  // Проверяем баланс при загрузке страницы
  useEffect(() => {
    const checkBalance = async () => {
      if (balance) {
        const balanceValue = Number(balance.available?.replace('₽', '') || 0)
        if (balanceValue < 0) {
          // Редиректим на профиль при минусовом балансе
          router.push('/profile')
          if (checkNegativeBalance) {
            await checkNegativeBalance()
          }
        }
      } else {
        // Если баланс еще не загружен, проверяем через функцию
        if (checkNegativeBalance) {
          const hasNegativeBalance = await checkNegativeBalance()
          if (hasNegativeBalance) {
            router.push('/profile')
          }
        }
      }
    }
    checkBalance()
  }, [balance, checkNegativeBalance, router])

  return (
    <>
      <Header />
      <OrdersPage onModalStateChange={setIsAnyModalOpen} />
      {!isAnyModalOpen && (
        <BottomNav 
          onFinanceClick={() => setIsFinanceModalOpen(true)}
        />
      )}
      {isFinanceModalOpen && (
        <FinanceModal 
          onClose={() => setIsFinanceModalOpen(false)} 
        />
      )}
    </>
  )
}







