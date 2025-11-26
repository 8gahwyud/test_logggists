'use client'

import { useState, useEffect } from 'react'
import Header from '@/components/Header/Header'
import BottomNav from '@/components/BottomNav/BottomNav'
import OrdersPage from '@/components/OrdersPage/OrdersPage'
import FinanceModal from '@/components/FinanceModal/FinanceModal'
import SupportModal from '@/components/SupportModal/SupportModal'

export default function OrdersRoute() {
  const [isFinanceModalOpen, setIsFinanceModalOpen] = useState(false)
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false)
  const [isAnyModalOpen, setIsAnyModalOpen] = useState(false)

  useEffect(() => {
    setIsAnyModalOpen(isFinanceModalOpen || isSupportModalOpen)
  }, [isFinanceModalOpen, isSupportModalOpen])

  return (
    <>
      <Header />
      <OrdersPage onModalStateChange={setIsAnyModalOpen} />
      {!isAnyModalOpen && (
        <BottomNav 
          onFinanceClick={() => setIsFinanceModalOpen(true)}
          onSupportClick={() => setIsSupportModalOpen(true)}
        />
      )}
      {isFinanceModalOpen && (
        <FinanceModal 
          onClose={() => setIsFinanceModalOpen(false)} 
        />
      )}
      {isSupportModalOpen && (
        <SupportModal 
          onClose={() => setIsSupportModalOpen(false)} 
        />
      )}
    </>
  )
}







